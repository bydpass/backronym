// Kaikki forms[] also contains table labels, auxiliaries and components of analytic constructions.
// Reject by relation tags, never by spelling (e.g. a genuine English 'strong' is unaffected).
export function isSurfaceForm(form) {
  return !(form.tags || []).some(tag => ['table-tags', 'auxiliary', 'multiword-construction'].includes(tag));
}
