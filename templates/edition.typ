#set text(
  font: "Libertinus Serif",
  size: 11pt,
  lang: "en",
  costs: (widow: 100%, orphan: 100%, runt: 85%, hyphenation: 75%),
)
#set par(justify: true, leading: 1.48em)
#set page(
  paper: "us-letter",
  binding: left,
  margin: (
    top: 1.05in,
    bottom: 1.05in,
    inside: 1.2in,
    outside: 0.92in,
  ),
)
#set heading(numbering: "1.")
#show heading.where(level: 1): set block(above: 2.2em, below: 0.8em)
#show heading.where(level: 1): set text(size: 15pt, weight: "semibold")
#show heading.where(level: 2): set block(above: 1.5em, below: 0.55em)
#show heading.where(level: 2): set text(size: 12.5pt, weight: "semibold")
#show quote: set block(inset: (left: 1.2em), above: 0.9em, below: 0.9em)

#let running-header(title) = context {
  let current = counter(page).get().first()
  if current == 1 {
    []
  } else {
    set text(size: 8.5pt, fill: luma(150), tracking: 0.03em)
    if calc.even(current) {
      align(left)[Outside In Print]
    } else {
      align(right)[#title]
    }
  }
}

#let running-footer() = context {
  let current = counter(page).get().first()
  if current == 1 {
    []
  } else {
    align(center)[#counter(page).display("1")]
  }
}

#set page(header: running-header([]), footer: running-footer())

#let masthead(label) = [
  #set text(size: 8.5pt, tracking: 0.08em, fill: luma(155))
  #smallcaps[#label]
]

#let metadata-grid(section-label, date, version, edition, url) = grid(
  columns: (auto, 1fr),
  gutter: 8pt,
  row-gutter: 4pt,
  [Section], [#section-label],
  [Date], [#date],
  [Version], [#version],
  [Edition], [#edition],
  [Archive], [#link(url)[Outside In Print]],
)

#let reference_entry(index: 1, title: "", url: "", host: "") = block(
  above: 0.8em,
  below: 0.8em,
)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.8em,
    [#strong[#index.]],
    [
      #link(url)[#title]
      #linebreak()
      #text(size: 9pt, fill: luma(145))[#host]
      #linebreak()
      #text(size: 8.5pt, fill: luma(130))[#url]
    ],
  )
]

#let citation-box(author, title, date, version, url) = block(
  inset: 14pt,
  stroke: 0.45pt + luma(110),
  radius: 4pt,
  above: 1.5em,
  below: 0.9em,
)[
  #set text(size: 9.25pt)
  #masthead([Suggested Citation])
  #v(0.45em)
  #author. #emph[#title]. #emph[Outside In Print], #date. Version #version. #link(url)[#url]
]

#let pdf_figure_placeholder(note: "Image kept on web edition only.") = block(
  inset: 12pt,
  stroke: 0.45pt + luma(175),
  radius: 4pt,
  above: 1.1em,
  below: 1.1em,
)[
  #align(center)[
    #set text(size: 9pt, style: "italic", fill: luma(120))
    #note
  ]
]

#let pdf_callout(title: [], body: []) = block(
  inset: 14pt,
  stroke: 0.45pt + luma(120),
  radius: 4pt,
  above: 1.2em,
  below: 1.2em,
)[
  #set text(size: 9.25pt)
  #title
  #v(0.45em)
  #body
]

#let opening-block(
  variant,
  title,
  subtitle,
  summary,
  section-label,
  date,
  version,
  edition,
  url,
  cover-image-path,
) = {
  let title-size = if variant == "visual" { 28pt } else { 23pt }
  let subtitle-fill = if variant == "report" { luma(120) } else { luma(150) }

  block(above: 12%)[
    #masthead([#section-label])
    #v(1.2em)
    #text(size: title-size, weight: "semibold")[#title]
    #if subtitle != "" [
      #v(0.65em)
      #set text(size: 13pt, fill: subtitle-fill)
      #subtitle
    ]
    #if summary != "" [
      #v(1.05em)
      #set text(size: 10.4pt, fill: luma(120))
      #summary
    ]
    #if cover-image-path != "" [
      #v(1.25em)
      #image(cover-image-path, width: 100%)
    ]
    #v(1.5em)
    #metadata-grid(section-label, date, version, edition, url)
  ]
}

#let colophon(author, title, date, version, edition, url) = {
  pagebreak()
  block(above: 16%)[
    #masthead([Colophon])
    #v(1.1em)
    #text(size: 14pt, weight: "semibold")[Outside In Print]
    #v(0.6em)
    This PDF edition was prepared as a clean reading companion to the HTML publication at Outside In Print.

    #v(0.9em)
    Set in Libertinus Serif at 11pt with generous leading for offline reading, saving, citation, and printing.

    #v(1.2em)
    #metadata-grid("Piece", date, version, edition, url)

    #citation-box(author, title, date, version, url)
  ]
}

#let render(
  title: "",
  subtitle: "",
  summary: "",
  variant: "essay",
  section_label: "Piece",
  date: "",
  version: "1.0",
  edition: "First digital edition",
  author: "Outside In Print",
  url: "",
  cover_image_path: "",
  doc_date: none,
  show_toc: false,
  compact_frontmatter: false,
  show_colophon: true,
  body: [],
  references: [],
) = {
  set document(title: title, author: author, date: doc_date)
  set page(header: running-header([#title]), footer: running-footer())

  if compact_frontmatter {
    opening-block(
      variant,
      title,
      subtitle,
      summary,
      section_label,
      date,
      version,
      edition,
      url,
      cover_image_path,
    )
  } else {
    opening-block(
      variant,
      title,
      subtitle,
      summary,
      section_label,
      date,
      version,
      edition,
      url,
      cover_image_path,
    )
    pagebreak()
  }

  if show_toc {
    heading(level: 1, outlined: false)[Contents]
    outline(depth: 2)
    pagebreak(to: "odd")
  }

  body

  if references != [] {
    heading(level: 1, outlined: false)[References]
    references
  }

  if show_colophon {
    colophon(author, title, date, version, edition, url)
  }
}
