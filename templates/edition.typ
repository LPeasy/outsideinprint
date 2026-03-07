#set page(margin: (x: 1in, y: 1in))
#set text(size: 11pt)
#set par(leading: 1.45em)
#set heading(numbering: none)

#let render(
  title: "",
  subtitle: "",
  section_label: "Piece",
  issue: "Issue 001",
  date: "",
  version: "1.0",
  edition: "First digital edition",
  author: "Outside In Print",
  url: "",
  doc_date: none,
  body: []
) = {
  set document(title: title, author: author, date: doc_date)

  align(center)[
    #text(size: 20pt, weight: "bold")[#title]
  ]
  if subtitle != "" {
    align(center)[#emph[#subtitle]]
  }

  v(16pt)

  box(
    inset: 8pt,
    stroke: 0.5pt + gray,
    radius: 4pt,
    [
      #smallcaps(section_label)       #issue       #date       Version #version       #edition
    ]
  )

  v(24pt)

  body

  v(36pt)

  box(
    inset: 8pt,
    stroke: 0.5pt + gray,
    radius: 4pt,
    [
      *Citation*

      #(author + ". \"" + title + ".\" _Outside In Print_, " + date + ". Version " + version + ". " + url)
    ]
  )
}

