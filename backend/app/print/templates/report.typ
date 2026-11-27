// Manager report (F11). Layout only: values, charts (SVG) and verdicts come prepared in `data`.
#let data = json(bytes(sys.inputs.data))
#let navy = rgb("#0c3f76")
#let error-red = rgb("#e7000b")

#set document(title: "Raport z wyników badań " + data.period_from + " - " + data.period_to)
#set text(lang: "pl", font: "DejaVu Sans", size: 9.5pt)
#set page(
  paper: "a4",
  margin: (x: 1.6cm, top: 1.8cm, bottom: 2cm),
  footer: context [
    #set text(size: 8pt, fill: luma(90))
    Wygenerowano: #data.generated_on, #data.author
    #h(1fr)
    Strona #counter(page).display("1 z 1", both: true)
  ],
)
#show heading: set text(fill: navy)
#set table(stroke: 0.5pt + luma(180), inset: 5pt)

= Raport z wyników badań

Okres: *#data.period_from - #data.period_to* #h(1fr)
Wyniki poza progiem weryfikacji: *#data.total_out*

#if data.parameters.len() == 0 [
  Brak wyników badań w tym okresie.
] else [
  #table(
    columns: (1fr, auto, auto, auto),
    table.header([*Parametr*], [*Próg weryfikacji*], [*Wyników*], [*Poza progiem*]),
    ..data.parameters
      .map(p => (p.name + " [" + p.unit + "]", p.threshold, str(p.count), str(p.out_of_threshold)))
      .flatten()
  )
]

#for p in data.parameters [
  #pagebreak(weak: true)
  == #p.name [#p.unit]

  Próg weryfikacji: #p.threshold #h(1fr) Wyników: #p.count, poza progiem: #p.out_of_threshold

  #image(bytes(p.chart_svg), format: "svg", width: 100%)

  #table(
    columns: (auto, 1fr, auto, auto),
    table.header([*Data*], [*Próbka*], [*Wartość*], [*Ocena*]),
    ..p.points
      .map(pt => (
        pt.at,
        pt.sample_label,
        pt.value,
        if pt.verdict == "w progu" [#pt.verdict] else [#text(fill: error-red)[*#pt.verdict*]],
      ))
      .flatten()
  )
]
