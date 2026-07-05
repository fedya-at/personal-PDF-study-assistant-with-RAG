"""Fixed-size chunking with overlap, tagged with page number + chunk id."""


def chunk_text(page_text, page_number, chunk_size=800, chunk_overlap=150, doc_id="doc"):
    chunks = []
    start = 0
    n = len(page_text)
    idx = 0

    while start < n:
        end = min(start + chunk_size, n)
        piece = page_text[start:end].strip()
        if piece:
            chunks.append({
                "chunk_id": f"{doc_id}-p{page_number}-c{idx}",
                "doc_id": doc_id,
                "page_number": page_number,
                "text": piece
            })
            idx += 1
        if end == n:
            break
        start = end - chunk_overlap  # step back to create overlap

    return chunks


def chunk_pages(pages, doc_id, chunk_size=800, chunk_overlap=150):
    all_chunks = []
    for page in pages:
        all_chunks.extend(
            chunk_text(page["text"], page["page_number"], chunk_size, chunk_overlap, doc_id)
        )
    return all_chunks
