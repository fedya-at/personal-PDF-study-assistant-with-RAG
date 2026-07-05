"""PDF ingestion: extract text page-by-page using PyMuPDF."""
import fitz  # PyMuPDF


def load_pdf_pages(pdf_path: str) -> list[dict]:
    """
    Extract text from a PDF, one entry per page.
    Returns: [{"page_number": 1, "text": "..."}, ...]
    """
    doc = fitz.open(pdf_path)
    pages = []

    for page_index in range(len(doc)):
        text = doc[page_index].get_text("text").strip()
        if text:  # skip blank/scanned pages with no extractable text
            pages.append({"page_number": page_index + 1, "text": text})

    doc.close()
    return pages
