// Muskelgrafik aus der ursprünglichen App.
var MNAMES = {lats:"Latissimus", traps:"oberer Rücken", delts_f:"Schulter", delts_b:"Schulter", biceps:"Bizeps", triceps:"Trizeps",
  forearms:"Unterarm", forearms_b:"Unterarm", chest:"Brust", quads:"Oberschenkel", calves:"Waden"};
function hp(cmds, cx, side){
  return cmds.map(function(c){ var o = c[0]; for (var i = 1; i < c.length; i += 2) o += (i > 1 ? " " : "") + (cx + side * c[i]).toFixed(1) + "," + c[i + 1]; return o; }).join(" ") + " Z";
}
var TORSO = [["M",-0.6,25],["L",6,25],["C",10,30,21,30,26,34],["C",31,36,31,44,26,51],["C",21,61,15,78,15,92],["C",16,98,19,102,18,108],["L",-0.6,108]];
var ARM = [["M",24,36],["C",32,37,35,50,34,62],["C",34,70,35.5,80,34.5,92],["C",33.5,100,32,104,31,108],["L",26,108],["C",25.5,100,24.5,88,24.5,78],["C",24.5,72,23.5,66,22.5,56],["C",22,50,21.5,46,21.5,44]];
var LEG = [["M",19,103],["C",21.5,116,20.5,136,17,150],["C",16.5,160,17,172,15,184],["C",13.5,192,12.5,196,12,200],["L",6.5,200],["C",6.5,192,5.5,178,6,166],["C",6.5,158,4.8,152,4.8,146],["C",4,132,2,118,-0.6,108]];
var SH = {
  chest: [["M",0.8,37],["C",7,34,17,34,21,38.5],["C",23,41,23.5,47,21,52],["C",17,57,11,59.5,5,59],["C",2.5,58.5,1.2,57.5,0.8,56]],
  delt: [["M",17,35.5],["C",23,32,31,34,33,42],["C",34,48,31,54,28.5,58],["C",26,52,23,46,19,41]],
  biceps: [["M",24.5,50],["C",28,48,31.5,51,32,57],["C",32.4,63,30.5,68,28,70],["C",26,68,24.2,63,24,57],["C",23.9,54,24,52,24.5,50]],
  forearm: [["M",26,73],["C",30,72,34,76,34,84],["C",33.8,92,32,100,30.5,105],["L",27.5,105],["C",26.3,98,25.4,88,25.4,80],["C",25.4,77,25.6,74.5,26,73]],
  obl: [["M",9.5,62],["C",13.5,66,14.5,78,14.5,90],["C",12.5,91,10.5,90,9.5,88]],
  serr1: [["M",14.5,60],["L",19,58],["L",19.5,61],["L",15,63]],
  serr2: [["M",14.8,65],["L",19.2,63.5],["L",19.4,66.5],["L",15.2,68]],
  quadO: [["M",17,108],["C",21,116,21,132,18,146],["C",16.5,150,14,151,12.5,149],["C",13,138,13.5,122,13,110]],
  quadM: [["M",11.5,107],["C",14,116,14,132,12,145],["C",10.5,146,9,145,8.5,143],["C",8.5,130,9,116,11.5,107]],
  quadI: [["M",7.5,128],["C",9,134,9.5,141,8,147],["C",6,148,4.8,146,4.8,142],["C",4.8,136,5.8,131,7.5,128]],
  shin: [["M",12.5,154],["C",14,162,13.5,176,12.5,186],["L",11,186],["C",11,176,11,162,12.5,154]],
  calfF: [["M",15,156],["C",17.5,162,17.5,172,15.5,180],["C",14.5,172,14.3,163,15,156]],
  traps: [["M",-0.6,26],["L",5,27],["C",10,31,19,33,24,37],["C",19,40,10,44,6,56],["L",-0.6,62]],
  infra: [["M",7,44],["C",12,40,19,40,23,45],["C",20,49,14,51,9,50]],
  lats: [["M",6,52],["C",12,49,20,48,24.5,51],["C",23.5,62,19,76,13.5,88],["C",10,85,7.5,80,6,74]],
  erector: [["M",1.2,72],["C",4.5,72,6.5,80,6.5,90],["C",6.5,95,5,99,1.2,100]],
  triL: [["M",23,49],["C",25.5,47,27.5,52,27.5,60],["C",27.5,66,26,70,24.5,71],["C",23.5,66,23,58,23,49]],
  triO: [["M",28,47],["C",32,48,33.5,55,33,62],["C",32.5,67,30.5,70,28.5,70.5],["C",29,64,29,56,28,47]],
  glute: [["M",1,103],["C",8,99,16,100,18.5,106],["C",19.5,113,15,118,8,118],["C",4,118,1.5,116,1,112]],
  hamO: [["M",16,121],["C",18.5,128,18,140,15,148],["C",13.5,146,13,138,13,130],["C",13,126,14,122,16,121]],
  hamI: [["M",11,121],["C",12.5,128,12.5,140,10.5,148],["C",8,146,6.5,138,6.5,130],["C",6.5,125,8.5,121,11,121]],
  calfO: [["M",14.5,154],["C",18,160,18,171,14.5,180],["C",12.5,176,11.8,166,12.5,158],["C",13,156,13.7,154.5,14.5,154]],
  calfI: [["M",10,154],["C",11.8,158,12,168,10.5,182],["C",7,178,5.6,168,6.4,160],["C",7,157,8.4,155,10,154]]
};
var LN = {
  pec: [["M",3,47],["C",9,45,15,44,20,45]],
  add: [["M",1.5,112],["C",3.5,118,5,124,6,130]],
  ach: [["M",9,182],["C",9.3,188,9.5,194,9.6,198]],
  spine: [["M",0,28],["L",0,100]]
};
function hpo(cmds, cx, side){ return hp(cmds, cx, side).replace(/ Z$/, ""); }
function figure(cx, back, on){
  var o = "";
  function cls(name){ return on.p.indexOf(name) >= 0 ? "m1" : on.s.indexOf(name) >= 0 ? "m2" : "mu"; }
  function both(f){ return f(-1) + f(1); }
  function P(cmds, c){ return both(function(sd){ return '<path class="' + c + '" d="' + hp(cmds, cx, sd) + '"/>'; }); }
  function Ln(cmds){ return both(function(sd){ return '<path class="ln" d="' + hpo(cmds, cx, sd) + '"/>'; }); }
  o += '<ellipse class="b" cx="' + cx + '" cy="13" rx="8.5" ry="10.5"/><g transform="matrix(1.22 0 0 1 ' + (-0.22 * cx).toFixed(2) + ' 0)"><rect class="b" x="' + (cx - 5) + '" y="20" width="10" height="8"/>';
  o += P(LEG, "b") + P(ARM, "b") + P(TORSO, "b");
  o += both(function(sd){ return '<path class="b" d="M' + (cx + sd * 26) + ',107 C' + (cx + sd * 25) + ',113 ' + (cx + sd * 27) + ',120 ' + (cx + sd * 29) + ',120 C' + (cx + sd * 32) + ',119 ' + (cx + sd * 32.5) + ',112 ' + (cx + sd * 31) + ',107 Z"/><path class="b" d="M' + (cx + sd * 6.5) + ',199 L' + (cx + sd * 12) + ',199 C' + (cx + sd * 14.5) + ',201 ' + (cx + sd * 15) + ',205 ' + (cx + sd * 12) + ',205 L' + (cx + sd * 6) + ',205 Z"/>'; });
  if (!back){
    o += P(SH.chest, cls("chest")) + Ln(LN.pec) + P(SH.delt, cls("delts_f")) + P(SH.biceps, cls("biceps")) + P(SH.forearm, cls("forearms"));
    [62, 71.5, 81].forEach(function(y){ o += both(function(sd){ return '<rect class="mu" x="' + (sd > 0 ? cx + 1 : cx - 8) + '" y="' + y + '" width="7" height="8.5" rx="1.6"/>'; }); });
    o += both(function(sd){ return '<rect class="mu" x="' + (sd > 0 ? cx + 1.5 : cx - 7.5) + '" y="90.5" width="6" height="8" rx="1.6"/>'; });
    o += P(SH.obl, "mu") + P(SH.serr1, "mu") + P(SH.serr2, "mu");
    o += P(SH.quadO, cls("quads")) + P(SH.quadM, cls("quads")) + P(SH.quadI, cls("quads")) + Ln(LN.add) + P(SH.shin, "mu") + P(SH.calfF, cls("calves"));
  } else {
    o += P(SH.traps, cls("traps")) + P(SH.infra, "mu") + P(SH.delt, cls("delts_b")) + P(SH.lats, cls("lats")) + P(SH.erector, "mu") + Ln(LN.spine);
    o += P(SH.triL, cls("triceps")) + P(SH.triO, cls("triceps")) + P(SH.forearm, cls("forearms_b"));
    o += P(SH.glute, "mu") + P(SH.hamO, "mu") + P(SH.hamI, "mu") + P(SH.calfO, cls("calves")) + P(SH.calfI, cls("calves")) + Ln(LN.ach);
  }
  return o + '</g>';
}
var VIEW = {
  latzug:{f:"b", y0:22, y1:100}, rudern:{f:"b", y0:22, y1:100}, seitheben:{f:"f", y0:24, y1:72},
  preacher:{f:"f", y0:30, y1:118}, trizeps_oh:{f:"b", y0:30, y1:118}, hammer:{f:"f", y0:30, y1:118},
  rope:{f:"b", y0:30, y1:118}, reverse:{f:"f", y0:62, y1:120}, butterfly:{f:"f", y0:24, y1:72},
  beinstrecker:{f:"f", y0:96, y1:160}, waden:{f:"b", y0:140, y1:206},
  brustpresse:{f:"f", w:60, y0:30, y1:66}, reverse_fly:{f:"b", w:62, y0:28, y1:66}, beinpresse:{f:"f", w:46, y0:102, y1:150}
};
function bodySVGInner(id, on){
  var back = ["lats", "traps", "delts_b", "triceps", "forearms_b", "calves"].indexOf(on.p[0]) >= 0;
  var v = VIEW[id] || {f:back ? "b" : "f", y0:0, y1:212}, bw = v.w || 90, x0 = (v.f === "f" ? 50 : 150) - bw / 2;
  var fig = v.f === "f" ? figure(50, false, on) : figure(150, true, on);
  return '<div class="bodyw"><svg class="body" viewBox="' + x0 + ' ' + v.y0 + ' ' + bw + ' ' + (v.y1 - v.y0) + '" aria-hidden="true" focusable="false">' + fig + '</svg></div>';
}

export function bodySVG(ex) {
  const on = ex && ex.muscles;
  if (!on || !on.p || !on.p.length) return '';
  return bodySVGInner(ex.id, on);
}
