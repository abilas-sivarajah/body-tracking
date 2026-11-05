// Lädt den Bundeslebensmittelschlüssel erst, wenn er gebraucht wird.
let loading = null;

export function loadFoods() {
  if (!loading) {
    loading = fetch('/data/bls.min.json')
      .then(r => { if (!r.ok) throw new Error('BLS ' + r.status); return r.json(); })
      .then(d => d.foods)
      .catch(e => { loading = null; throw e; });
  }
  return loading;
}
