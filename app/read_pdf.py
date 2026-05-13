import PyPDF2
import sys

try:
    reader = PyPDF2.PdfReader('/app/mockup.pdf')
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            print(f"--- PAGE {i+1} ---")
            print(text)
except Exception as e:
    print(f"Error reading PDF: {e}", file=sys.stderr)
