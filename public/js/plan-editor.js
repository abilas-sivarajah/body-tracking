// Trainingspläne bearbeiten. Rendert in die Klappkarte „Trainingstage“.
import {
  trainDays, assignPlan, newExercise, archiveExercise, removePlan, exerciseMap, uid6, withSchedule, autoSchedule
} from './logic.js';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MUSCLE_CHOICES = [
  ['lats', 'Rücken'], ['chest', 'Brust'], ['delts_f', 'Schulter'], ['biceps', 'Bizeps'], ['triceps', 'Trizeps'],
  ['forearms', 'Unterarm'], ['quads', 'Oberschenkel'], ['calves', 'Waden']
];

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach(c => c && n.appendChild(c));
  return n;
};
const field = (label, input) => el('label', { class: 'pfield' }, el('span', { text: label }), input);

let openPlanId = null;

export function renderPlanEditor(box, { plan, today, onChange, toast }) {
  box.innerHTML = '';
  const change = next => onChange(next);
  const planIds = Object.keys(plan.plans);
  const exMap = exerciseMap(plan);
  const active = plan.exercises.filter(e => !e.archived);

  // Welcher Plan an welchem Tag
  const days = trainDays(plan);
  if (days.length) {
    const rows = el('div', { class: 'pdays' });
    days.forEach(d => {
      const sel = el('select', { 'aria-label': 'Plan für ' + DAY_NAMES[d], onchange: e => change(assignPlan(plan, d, e.target.value, today)) });
      planIds.forEach(id => { const o = el('option', { value: id, text: plan.plans[id].name }); if (plan.schedule[d] === id) o.selected = true; sel.appendChild(o); });
      rows.appendChild(field(DAY_NAMES[d], sel));
    });
    box.appendChild(rows);
    if (!plan.scheduleAuto) {
      box.appendChild(el('button', {
        type: 'button', class: 'linkbtn', text: 'Pläne automatisch verteilen',
        onclick: () => change(withSchedule(plan, autoSchedule(days, plan.plans), today, true))
      }));
    }
  }

  // Pläne
  box.appendChild(el('h4', { class: 'ph', text: 'Meine Pläne' }));
  planIds.forEach(planId => {
    const def = plan.plans[planId];
    const update = patch => change({ ...plan, plans: { ...plan.plans, [planId]: { ...def, ...patch } } });
    const d = el('details', { class: 'pplan' });
    if (openPlanId === planId) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) openPlanId = planId; else if (openPlanId === planId) openPlanId = null; });
    d.dataset.k = 'noremember';
    d.appendChild(el('summary', {}, el('span', { text: def.name }), el('span', { class: 'fm', text: def.exerciseIds.length + (def.exerciseIds.length === 1 ? ' Übung' : ' Übungen') })));

    const nameIn = el('input', { value: def.name, maxlength: 40, autocomplete: 'off', onchange: e => { const v = e.target.value.trim(); if (v) update({ name: v }); } });
    d.appendChild(field('Name', nameIn));

    const list = el('ol', { class: 'plist' });
    def.exerciseIds.forEach((exId, i) => {
      const ex = exMap[exId];
      if (!ex) return;
      const move = dir => {
        const ids = def.exerciseIds.slice(), j = i + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        update({ exerciseIds: ids });
      };
      list.appendChild(el('li', {},
        el('span', { class: 'pname', text: ex.name }),
        el('button', { type: 'button', class: 'pbtn', 'aria-label': ex.name + ' nach oben', text: '↑', onclick: () => move(-1) }),
        el('button', { type: 'button', class: 'pbtn', 'aria-label': ex.name + ' nach unten', text: '↓', onclick: () => move(1) }),
        el('button', { type: 'button', class: 'pbtn', 'aria-label': ex.name + ' aus Plan entfernen', text: '×', onclick: () => update({ exerciseIds: def.exerciseIds.filter(x => x !== exId) }) })
      ));
    });
    d.appendChild(list);

    const rest = active.filter(e => !def.exerciseIds.includes(e.id));
    if (rest.length) {
      const add = el('select', { 'aria-label': 'Übung hinzufügen', onchange: e => { if (e.target.value) update({ exerciseIds: def.exerciseIds.concat([e.target.value]) }); } });
      add.appendChild(el('option', { value: '', text: 'Übung hinzufügen …' }));
      rest.forEach(e => add.appendChild(el('option', { value: e.id, text: e.name })));
      d.appendChild(add);
    }
    if (planIds.length > 1) {
      d.appendChild(el('button', { type: 'button', class: 'linkbtn pdel', text: 'Plan löschen', onclick: () => change(removePlan(plan, planId, today)) }));
    }
    box.appendChild(d);
  });

  const newPlanIn = el('input', { placeholder: 'Name des neuen Plans', maxlength: 40, autocomplete: 'off', 'aria-label': 'Name des neuen Plans' });
  box.appendChild(el('div', { class: 'wcustom pnew' }, newPlanIn, el('button', {
    type: 'button', class: 'btn ghost', text: 'Plan anlegen',
    onclick: () => {
      const name = newPlanIn.value.trim();
      if (!name) { toast('Gib dem Plan einen Namen.'); newPlanIn.focus(); return; }
      const id = 'p_' + uid6();
      openPlanId = id;
      change({ ...plan, plans: { ...plan.plans, [id]: { name, exerciseIds: [] } } });
    }
  })));

  // Eigene Übung
  const f = {
    name: el('input', { maxlength: 60, autocomplete: 'off' }),
    sets: el('input', { inputmode: 'numeric', value: '3' }),
    lo: el('input', { inputmode: 'numeric', value: '8' }),
    hi: el('input', { inputmode: 'numeric', value: '12' }),
    rest: el('input', { inputmode: 'numeric', value: '90' }),
    kg: el('input', { inputmode: 'decimal' }),
    step: el('input', { inputmode: 'decimal', value: '5' }),
    drop: el('input', { type: 'checkbox' }),
    time: el('input', { type: 'checkbox' }),
    muscle: el('select', {}, el('option', { value: '', text: 'Keine Angabe' }), MUSCLE_CHOICES.map(([v, t]) => el('option', { value: v, text: t })))
  };
  const comma = v => String(v).replace(',', '.');
  const form = el('details', { class: 'pplan' });
  form.dataset.k = 'noremember';
  form.appendChild(el('summary', {}, el('span', { text: 'Neue Übung anlegen' })));
  form.appendChild(el('div', { class: 'pform' },
    field('Name', f.name), field('Sätze', f.sets), field('Wdh. von', f.lo), field('Wdh. bis', f.hi),
    field('Pause (s)', f.rest), field('Startgewicht (kg)', f.kg), field('Steigerung (kg)', f.step), field('Muskelgruppe', f.muscle)
  ));
  form.appendChild(el('label', { class: 'pcheck' }, f.drop, el('span', { text: 'Mit Dropsatz' })));
  form.appendChild(el('label', { class: 'pcheck' }, f.time, el('span', { text: 'Zeitübung (Minuten statt Sätze)' })));
  form.appendChild(el('div', { class: 'actions' }, el('button', {
    type: 'button', class: 'btn ghost', text: 'Übung speichern',
    onclick: () => {
      if (!f.name.value.trim()) { toast('Gib der Übung einen Namen.'); f.name.focus(); return; }
      const ex = newExercise({
        name: f.name.value, kind: f.time.checked ? 'time' : undefined, min: f.rest.value && f.time.checked ? 10 : undefined,
        sets: f.sets.value, repsLo: f.lo.value, repsHi: f.hi.value, rest: f.rest.value,
        kg: comma(f.kg.value), step: comma(f.step.value), drop: f.drop.checked, muscles: f.muscle.value ? [f.muscle.value] : []
      });
      change({ ...plan, exercises: plan.exercises.concat([ex]) });
      toast('Übung angelegt. Füge sie jetzt einem Plan hinzu.');
    }
  })));
  box.appendChild(form);

  // Eigene Übungen entfernen
  const own = active.filter(e => e.id.startsWith('x_'));
  if (own.length) {
    const d = el('details', { class: 'pplan' });
    d.dataset.k = 'noremember';
    d.appendChild(el('summary', {}, el('span', { text: 'Eigene Übungen' }), el('span', { class: 'fm', text: String(own.length) })));
    const ul = el('ul', { class: 'plist' });
    own.forEach(e => ul.appendChild(el('li', {},
      el('span', { class: 'pname', text: e.name }),
      el('button', { type: 'button', class: 'pbtn', 'aria-label': e.name + ' entfernen', text: '×', onclick: () => change(archiveExercise(plan, e.id)) })
    )));
    d.appendChild(ul);
    box.appendChild(d);
  }
}
