import json
import structlog
import numpy as np
from pathlib import Path
from typing import Optional
from sentence_transformers import SentenceTransformer
import faiss

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 dimension


class FAISSVectorStore:
    """
    FAISS-based vector store for resume and job description chunks.
    Each interview/document gets its own isolated index file.
    """

    def __init__(self):
        self._model: Optional[SentenceTransformer] = None
        self.store_base_path = Path(settings.vector_store_path)
        self.store_base_path.mkdir(parents=True, exist_ok=True)

    @property
    def model(self) -> SentenceTransformer:
        """Lazy load the embedding model."""
        if self._model is None:
            logger.info("Loading sentence transformer model", model=settings.embedding_model)
            self._model = SentenceTransformer(settings.embedding_model)
        return self._model

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        """Generate embeddings for a list of texts."""
        embeddings = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return embeddings.astype(np.float32)

    def create_index(
        self,
        texts: list[str],
        metadata: list[dict],
        store_id: str,
    ) -> dict:
        """
        Create a FAISS index from a list of texts and store it to disk.

        Args:
            texts: Text chunks to index
            metadata: Corresponding metadata for each chunk
            store_id: Unique identifier for this index (e.g., resume ID)

        Returns:
            dict with store path and index info
        """
        if not texts:
            raise ValueError("Cannot create empty vector index")

        embeddings = self.embed_texts(texts)

        # Build a flat inner-product index (cosine similarity since embeddings are normalized)
        index = faiss.IndexFlatIP(EMBEDDING_DIM)
        index.add(embeddings)

        # Persist index and metadata to disk
        store_path = self.store_base_path / store_id
        store_path.mkdir(parents=True, exist_ok=True)

        faiss.write_index(index, str(store_path / "index.faiss"))

        chunks_data = [{"text": t, "metadata": m} for t, m in zip(texts, metadata)]
        with open(store_path / "chunks.json", "w") as f:
            json.dump(chunks_data, f)

        logger.info("FAISS index created", store_id=store_id, chunks=len(texts))
        return {
            "store_path": str(store_path),
            "chunk_count": len(texts),
            "store_id": store_id,
        }

    def retrieve(
        self,
        query: str,
        store_id: str,
        top_k: int = 5,
        score_threshold: float = 0.3,
    ) -> list[dict]:
        """
        Retrieve top-k relevant chunks for a query.

        Returns:
            list of {text, metadata, score} dicts sorted by relevance
        """
        store_path = self.store_base_path / store_id
        index_path = store_path / "index.faiss"
        chunks_path = store_path / "chunks.json"

        if not index_path.exists():
            logger.warning("Vector store not found", store_id=store_id)
            return []

        index = faiss.read_index(str(index_path))
        with open(chunks_path) as f:
            chunks = json.load(f)

        query_embedding = self.embed_texts([query])
        scores, indices = index.search(query_embedding, min(top_k, len(chunks)))

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            if float(score) < score_threshold:
                continue
            results.append({
                "text": chunks[idx]["text"],
                "metadata": chunks[idx]["metadata"],
                "score": float(score),
            })

        logger.debug("RAG retrieval", store_id=store_id, query_len=len(query), results=len(results))
        return results

    def delete_store(self, store_id: str) -> None:
        """Delete an index from disk."""
        import shutil
        store_path = self.store_base_path / store_id
        if store_path.exists():
            shutil.rmtree(store_path)
            logger.info("Vector store deleted", store_id=store_id)


def chunk_resume(parsed_data: dict, raw_text: str) -> tuple[list[str], list[dict]]:
    """
    Split resume into semantic chunks with metadata.
    Each chunk focuses on a specific section for precise retrieval.
    """
    chunks = []
    metadatas = []

    def add_chunk(text: str, section: str, subsection: str = ""):
        if text and len(text.strip()) > 30:
            chunks.append(text.strip())
            metadatas.append({"section": section, "subsection": subsection})

    # Summary chunk
    if parsed_data.get("summary"):
        add_chunk(parsed_data["summary"], "summary")

    # Skills chunk — combine all skill categories
    skills = parsed_data.get("skills", {})
    skill_text_parts = []
    for category, skill_list in skills.items():
        if skill_list:
            skill_text_parts.append(f"{category.title()}: {', '.join(skill_list)}")
    if skill_text_parts:
        add_chunk("Skills and Technologies:\n" + "\n".join(skill_text_parts), "skills")

    # Individual experience chunks
    for exp in parsed_data.get("experience", []):
        exp_text = (
            f"Work Experience at {exp.get('company', 'Unknown')} as {exp.get('title', 'Unknown')} "
            f"({exp.get('duration', '')}):\n"
            f"Responsibilities: {'; '.join(exp.get('responsibilities', []))}\n"
            f"Technologies used: {', '.join(exp.get('technologies', []))}"
        )
        add_chunk(exp_text, "experience", exp.get("company", ""))

    # Individual project chunks
    for proj in parsed_data.get("projects", []):
        proj_text = (
            f"Project: {proj.get('name', 'Unknown')}\n"
            f"Description: {proj.get('description', '')}\n"
            f"Technologies: {', '.join(proj.get('technologies', []))}\n"
            f"Highlights: {'; '.join(proj.get('highlights', []))}"
        )
        add_chunk(proj_text, "projects", proj.get("name", ""))

    # Education chunk
    education = parsed_data.get("education", [])
    if education:
        edu_text = "Education:\n" + "\n".join(
            f"{e.get('degree', '')} in {e.get('field', '')} from {e.get('institution', '')} ({e.get('year', '')})"
            for e in education
        )
        add_chunk(edu_text, "education")

    # Certifications chunk
    certs = parsed_data.get("certifications", [])
    if certs:
        cert_text = "Certifications:\n" + "\n".join(
            f"{c.get('name', '')} by {c.get('issuer', '')} ({c.get('year', '')})"
            for c in certs
        )
        add_chunk(cert_text, "certifications")

    return chunks, metadatas


def chunk_job_description(parsed_data: dict, raw_text: str) -> tuple[list[str], list[dict]]:
    """Split JD into semantic chunks."""
    chunks = []
    metadatas = []

    def add_chunk(text: str, section: str):
        if text and len(text.strip()) > 20:
            chunks.append(text.strip())
            metadatas.append({"section": section})

    add_chunk(f"Job Title: {parsed_data.get('job_title', 'Unknown')}", "title")

    required = parsed_data.get("required_skills", [])
    if required:
        add_chunk("Required Skills: " + ", ".join(required), "required_skills")

    preferred = parsed_data.get("preferred_skills", [])
    if preferred:
        add_chunk("Preferred Skills: " + ", ".join(preferred), "preferred_skills")

    responsibilities = parsed_data.get("responsibilities", [])
    if responsibilities:
        add_chunk("Responsibilities:\n" + "\n".join(f"- {r}" for r in responsibilities), "responsibilities")

    technologies = parsed_data.get("technologies", [])
    if technologies:
        add_chunk("Technologies: " + ", ".join(technologies), "technologies")

    key_reqs = parsed_data.get("key_requirements", [])
    if key_reqs:
        add_chunk("Key Requirements:\n" + "\n".join(f"- {r}" for r in key_reqs), "key_requirements")

    # Also add raw text as a fallback chunk
    if raw_text and len(raw_text) > 100:
        # Split long raw text into overlapping chunks
        words = raw_text.split()
        chunk_size = 200  # words per chunk
        overlap = 40
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if len(chunk) > 100:
                add_chunk(chunk, "raw_text")

    return chunks, metadatas


# ─── Singleton ────────────────────────────────────────────────────────────────

_vector_store: FAISSVectorStore | None = None


def get_vector_store() -> FAISSVectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = FAISSVectorStore()
    return _vector_store
