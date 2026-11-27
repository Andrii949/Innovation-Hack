// Equipment card with history (17025 6.4.13). Layout only: all values come prepared in `data`.
#let data = json(bytes(sys.inputs.data))
#let navy = rgb("#0c3f76")

#set document(title: "Karta urządzenia " + data.code)
#set text(lang: "pl", font: "DejaVu Sans", size: 9.5pt)
#set page(
  paper: "a4",
  margin: (x: 1.6cm, top: 1.8cm, bottom: 2cm),
  footer: context [
    #set text(size: 8pt, fill: luma(90))
    Wygenerowano: #data.generated_on
    #h(1fr)
    Strona #counter(page).display("1 z 1", both: true)
  ],
)
#show heading: set text(fill: navy)
#set table(stroke: 0.5pt + luma(180), inset: 5pt)

= Karta urządzenia #data.code

#if data.withdrawn != none [
  #block(fill: rgb("#fde8e8"), inset: 8pt, radius: 3pt, width: 100%)[
    *WYCOFANE Z UŻYTKU*: #data.withdrawn
  ]
]

#table(
  columns: (auto, 1fr, auto, 1fr),
  stroke: none,
  [*Nazwa*], [#data.name], [*Pracownia*], [#data.lab],
  [*Producent*], [#data.manufacturer], [*Lokalizacja*], [#data.location],
  [*Model*], [#data.model], [*Status*], [#data.status],
  [*Nr seryjny*], [#data.serial_no], [*Następne wzorcowanie*], [#data.next_due],
)

== Wzorcowania

#if data.calibrations.len() == 0 [Brak wpisów.] else [
  #table(
    columns: (auto, 1fr, auto, auto, auto, 2fr),
    table.header(
      [*Miesiąc*], [*Firma*], [*Nr świadectwa*], [*Wynik*], [*Następne*], [*Punkty*],
    ),
    ..data.calibrations
      .map(c => (c.month, c.vendor, c.certificate_no, c.result, c.next_due, c.points))
      .flatten()
  )
]

== Sprawdzenia

#if data.checks.len() == 0 [Brak wpisów.] else [
  #table(
    columns: (1fr, auto, 2fr, auto),
    table.header([*Plan*], [*Data*], [*Wartości*], [*W zakresie*]),
    ..data.checks
      .map(c => (c.plan, c.performed_on, c.values, if c.out_of_range [NIE] else [tak]))
      .flatten()
  )
]
