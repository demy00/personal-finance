// An intermediate module, so the guard proves a transitive reach is caught and
// not only a direct one. The subpath is deliberate: a mapper anchored on the
// bare specifier would miss it.
export * from 'expo-sqlite/kv-store';
