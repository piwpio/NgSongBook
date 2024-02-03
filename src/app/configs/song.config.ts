export const SongConfig = {
  defaultValues: {
    title: 'No name',
    author: 'Unknown Author',
    extra: null
  },
  regexp: {
    meta: {
      title: /\{title}(.+)/,
      author: /\{author}(.+)/,
      extra: /\{extra}(.+)/,
    }
  }
}
