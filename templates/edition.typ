#set text(
  font: "Libertinus Serif",
  size: 11pt,
  lang: "en",
  costs: (widow: 100%, orphan: 100%, runt: 85%, hyphenation: 75%),
)
#set par(justify: true, leading: 1.4em)
#set page(
  paper: "us-letter",
  binding: left,
  margin: (
    top: 1.1in,
    bottom: 1.1in,
    inside: 1.2in,
    outside: 0.9in,
  ),
)
#set heading(numbering: "1.")

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

#show heading.where(level: 1): set block(above: 2.2em, below: 0.8em)
#show heading.where(level: 1): set text(size: 15pt, weight: "semibold")
#show heading.where(level: 2): set block(above: 1.5em, below: 0.55em)
#show heading.where(level: 2): set text(size: 12.5pt, weight: "semibold")
#show quote: set block(inset: (left: 1.2em), above: 0.9em, below: 0.9em)

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

#let figure_note(body) = block(
  above: 0.7em,
  below: 1.2em,
)[
  #align(center)[
    #set text(size: 8.5pt, style: "italic", fill: luma(145))
    #body
  ]
]

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

#let colophon(author, title, date, version, edition, url) = {
  pagebreak()
  block(above: 16%)[
    #masthead([Colophon])
    #v(1.1em)
    #text(size: 14pt, weight: "semibold")[Outside In Print]
    #v(0.6em)
    This PDF edition was typeset in Typst from the archival markdown source maintained by Outside In Print.

    #v(0.9em)
    Set in Libertinus Serif at 11pt with 1.4 leading. Produced as a print-ready digital offprint for reading, citation, saving, and sharing.

    #v(1.2em)
    #metadata-grid("Piece", date, version, edition, url)

    #citation-box(author, title, date, version, url)
  ]
}

#let render(
  title: "",
  subtitle: "",
  section_label: "Piece",
  date: "",
  version: "1.0",
  edition: "First digital edition",
  author: "Outside In Print",
  url: "",
  doc_date: none,
  show_toc: false,
  body: [],
  references: [],
) = {
  set document(title: title, author: author, date: doc_date)
  set page(header: running-header([#title]), footer: running-footer())

  block(above: 12%)[
    #masthead([#section_label])
    #v(1.4em)
    #text(size: 23pt, weight: "semibold")[#title]
    #if subtitle != "" [
      #v(0.7em)
      #set text(size: 13pt, fill: luma(150))
      #subtitle
    ]
    #v(1.8em)
    #metadata-grid(section_label, date, version, edition, url)
  ]

  pagebreak()

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

  colophon(author, title, date, version, edition, url)
}