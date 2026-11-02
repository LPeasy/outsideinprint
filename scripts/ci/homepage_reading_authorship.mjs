// Independently check the rendered work's authors, including fictional dialogues.
export function isBobAuthoredReadingWork(nodes) {
  const work = nodes.find((node) => [node["@type"]].flat()
    .some((type) => ["Article", "CreativeWork", "ShortStory"].includes(type)));
  const authors = work?.author ? [work.author].flat() : [];
  return authors.length > 0 && authors.every((author) =>
    ["#author-robert-v-ussley", "#author-robert-v.-ussley"]
      .some((id) => author["@id"]?.endsWith(id)));
}
