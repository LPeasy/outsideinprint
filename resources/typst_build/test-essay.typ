#import "../../templates/edition.typ": render
#let article_body = include("test-essay.body.typ")

#render(
  title: "Test Essay",
  subtitle: "A pipeline test ~ proving PDFs, metadata, and library indexing",
  section_label: "Essay",
  issue: "Issue 001",
  date: "2026-03-04",
  version: "1.0",
  edition: "First digital edition",
  author: "Outside In Print",
  url: "https://outsideinprint.org/essays/test-essay/",
  doc_date: datetime(year: 2026, month: 3, day: 4),
  body: article_body
)
