"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, RotateCcw } from "lucide-react";

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function toNum(v: string | number) {
  const x = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("sv-SE");
}

function fmt1(n: number) {
  if (!Number.isFinite(n)) return "–";
  return (Math.round(n * 10) / 10).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMoneySEK(n: number) {
  if (!Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("sv-SE") + " kr";
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "–";
  return fmt1(n) + " %";
}

interface CalcInput {
  beds: number;
  occupancyPct: number;
  alosDays: number;
  vriPer1000BedDays: number;
  vriPerYearOverride: number;
  gramNegPct: number;
  sinkAttributablePct: number;
  effectPct: number;
  extraDaysPerVRI: number;
  costPerBedDay: number;
  costPerVRI: number;
  pricingMode: string;
  capex: number;
  opexYear: number;
  capexAmortYears: number;
}

function calc({
  beds,
  occupancyPct,
  vriPer1000BedDays,
  vriPerYearOverride,
  gramNegPct,
  sinkAttributablePct,
  effectPct,
  extraDaysPerVRI,
  costPerBedDay,
  costPerVRI,
  pricingMode,
  capex,
  opexYear,
  capexAmortYears,
}: CalcInput) {
  const occupancy = clamp(occupancyPct / 100, 0, 1);
  const bedDays = beds * 365 * occupancy;

  const vriFromRate = (vriPer1000BedDays / 1000) * bedDays;
  const vri = Number.isFinite(vriPerYearOverride) && vriPerYearOverride > 0 ? vriPerYearOverride : vriFromRate;

  const gramNeg = vri * (gramNegPct / 100);
  const sinkGramNeg = gramNeg * (sinkAttributablePct / 100);
  const avoided = sinkGramNeg * (effectPct / 100);

  const savedBedDays = avoided * extraDaysPerVRI;

  let savedSEK = 0;
  if (pricingMode === "perVRI") {
    savedSEK = avoided * costPerVRI;
  } else {
    savedSEK = savedBedDays * costPerBedDay;
  }

  const annualizedCapex = capexAmortYears > 0 ? capex / capexAmortYears : capex;
  const annualCost = annualizedCapex + opexYear;

  const net = savedSEK - annualCost;
  const roi = annualCost > 0 ? net / annualCost : NaN;
  const paybackYears = savedSEK > opexYear ? capex / Math.max(1, savedSEK - opexYear) : NaN;

  const vriPer1000 = bedDays > 0 ? (vri / bedDays) * 1000 : NaN;

  return {
    bedDays,
    vri,
    vriPer1000,
    gramNeg,
    sinkGramNeg,
    avoided,
    savedBedDays,
    savedSEK,
    annualCost,
    net,
    roi,
    paybackYears,
    usedOverride: Number.isFinite(vriPerYearOverride) && vriPerYearOverride > 0,
    vriFromRate,
  };
}

interface StateType {
  beds: number | string;
  occupancyPct: number | string;
  alosDays: number | string;
  vriPer1000BedDays: number | string;
  vriPerYearOverride: number | string;
  gramNegPct: number | string;
  sinkAttributablePct: number | string;
  effectPct: number | string;
  extraDaysPerVRI: number | string;
  costPerBedDay: number | string;
  costPerVRI: number | string;
  pricingMode: string;
  capex: number | string;
  opexYear: number | string;
  capexAmortYears: number | string;
}

function exportPDF(state: StateType, parsed: CalcInput, result: ReturnType<typeof calc>) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const date = new Date().toLocaleDateString("sv-SE");
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Colors
    const darkGray = '#1a1a1a';
    const mediumGray = '#666666';
    const lightGray = '#e5e5e5';
    const green = '#16a34a';
    const lightGreen = '#f0fdf4';
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(darkGray);
    doc.text('ROI-kalkyl: Handfat', 20, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(mediumGray);
    doc.text(`Genererad: ${date}`, 20, 33);
    
    // Indata Section
    doc.setFontSize(13);
    doc.setTextColor(darkGray);
    doc.text('Indata', 20, 50);
    
    doc.setDrawColor(lightGray);
    doc.line(20, 54, pageWidth - 20, 54);
    
    doc.setFontSize(9);
    
    // Left column
    const labelX = 20;
    const valueX = 70;
    const rightLabelX = 110;
    const rightValueX = 160;
    let y = 64;
    
    const addRow = (label: string, value: string, rightLabel?: string, rightValue?: string) => {
      doc.setTextColor(mediumGray);
      doc.text(label, labelX, y);
      doc.setTextColor(darkGray);
      doc.setFont('helvetica', 'bold');
      doc.text(value, valueX, y);
      doc.setFont('helvetica', 'normal');
      
      if (rightLabel && rightValue) {
        doc.setTextColor(mediumGray);
        doc.text(rightLabel, rightLabelX, y);
        doc.setTextColor(darkGray);
        doc.setFont('helvetica', 'bold');
        doc.text(rightValue, rightValueX, y);
        doc.setFont('helvetica', 'normal');
      }
      y += 8;
    };
    
    addRow('Antal vårdplatser:', fmtInt(parsed.beds), 'Extra vårddagar/VRI:', fmt1(parsed.extraDaysPerVRI));
    addRow('Beläggning:', fmtPct(parsed.occupancyPct), 'Kostnad/vårddygn:', fmtMoneySEK(parsed.costPerBedDay));
    addRow('VRI per 1000 vårddygn:', fmt1(parsed.vriPer1000BedDays), 'Investering (CAPEX):', fmtMoneySEK(parsed.capex));
    addRow('Andel gramnegativa:', fmtPct(parsed.gramNegPct), 'Årlig kostnad (OPEX):', fmtMoneySEK(parsed.opexYear));
    addRow('Handfatskoppling:', fmtPct(parsed.sinkAttributablePct), 'Avskrivningstid:', fmtInt(parsed.capexAmortYears) + ' år');
    addRow('Effekt (minskning):', fmtPct(parsed.effectPct));
    
    // Resultat Section
    y += 10;
    doc.setFontSize(13);
    doc.setTextColor(darkGray);
    doc.text('Resultat', 20, y);
    y += 4;
    doc.line(20, y, pageWidth - 20, y);
    y += 10;
    
    doc.setFontSize(9);
    
    addRow('Vårddygn per år:', fmtInt(result.bedDays), 'Undvikna infektioner/år:', fmt1(result.avoided));
    addRow('VRI per år:', fmt1(result.vri), 'Sparade vårddygn/år:', fmt1(result.savedBedDays));
    addRow('Gramnegativa VRI/år:', fmt1(result.gramNeg), 'Sparade kronor/år:', fmtMoneySEK(result.savedSEK));
    addRow('Handfatskopplade VRI:', fmt1(result.sinkGramNeg), 'Årskostnad:', fmtMoneySEK(result.annualCost));
    
    // Summary Box
    y += 10;
    doc.setFillColor(lightGreen);
    doc.setDrawColor('#86efac');
    doc.roundedRect(20, y, pageWidth - 40, 40, 3, 3, 'FD');
    
    y += 10;
    doc.setFontSize(11);
    doc.setTextColor(darkGray);
    doc.setFont('helvetica', 'bold');
    doc.text('Sammanfattning', 25, y);
    
    y += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray);
    doc.text('Netto per år:', 25, y);
    doc.setTextColor(green);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtMoneySEK(result.net), 55, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mediumGray);
    doc.text('Payback:', 100, y);
    doc.setTextColor(green);
    doc.setFont('helvetica', 'bold');
    doc.text(Number.isFinite(result.paybackYears) ? fmt1(result.paybackYears) + ' år' : '–', 120, y);
    
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#333333');
    doc.setFontSize(8);
    const summaryText = `Med antagandet ${fmtPct(parsed.sinkAttributablePct)} handfatskoppling och ${fmtPct(parsed.effectPct)} effekt undviks cirka ${fmt1(result.avoided)} gramnegativa vårdrelaterade infektioner per år, motsvarande ${fmt1(result.savedBedDays)} sparade vårddygn.`;
    const splitText = doc.splitTextToSize(summaryText, pageWidth - 50);
    doc.text(splitText, 25, y);
    
    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setDrawColor(lightGray);
    doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
    
    doc.setFontSize(8);
    doc.setTextColor(mediumGray);
    doc.text('Handfat ROI-kalkylator', 20, footerY);
    doc.text('Denna kalkyl är avsedd som beslutsunderlag. För kliniska beslut krävs lokala data och uppföljning.', 20, footerY + 5);
    
    // Save
    doc.save(`handfat-roi-kalkyl-${date}.pdf`);
  });
}

const defaults: StateType = {
  beds: 24,
  occupancyPct: 92,
  alosDays: 4.0,
  vriPer1000BedDays: 6.0,
  vriPerYearOverride: "",
  gramNegPct: 35,
  sinkAttributablePct: 10,
  effectPct: 10,
  extraDaysPerVRI: 5,
  costPerBedDay: 12000,
  costPerVRI: 90000,
  pricingMode: "bedDays",
  capex: 350000,
  opexYear: 25000,
  capexAmortYears: 5,
};

const scenarios = [
  { key: "conservative", label: "Konservativt", effectPct: 5, tag: "Lågt antagande" },
  { key: "low", label: "Lågt (din 10%)", effectPct: 10, tag: "Defensivt" },
  { key: "ambitious", label: "Ambitiöst", effectPct: 20, tag: "Tryck" },
];

function Field({ id, label, value, onChange, helper, right, type = "text" }: {
  id: string;
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  helper?: string;
  right?: React.ReactNode;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {right}
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} type={type} />
      {helper ? <p className="text-xs text-muted-foreground leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function Metric({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-4 bg-background">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}

export default function HandfatROIKalkylator() {
  const [state, setState] = useState<StateType>(defaults);

  const parsed = useMemo(() => {
    const vriOverride = toNum(state.vriPerYearOverride);

    return {
      ...state,
      beds: clamp(toNum(state.beds), 0, 2000),
      occupancyPct: clamp(toNum(state.occupancyPct), 0, 100),
      alosDays: clamp(toNum(state.alosDays), 0, 365),
      vriPer1000BedDays: clamp(toNum(state.vriPer1000BedDays), 0, 200),
      vriPerYearOverride: Number.isFinite(vriOverride) ? vriOverride : NaN,
      gramNegPct: clamp(toNum(state.gramNegPct), 0, 100),
      sinkAttributablePct: clamp(toNum(state.sinkAttributablePct), 0, 100),
      effectPct: clamp(toNum(state.effectPct), 0, 100),
      extraDaysPerVRI: clamp(toNum(state.extraDaysPerVRI), 0, 365),
      costPerBedDay: clamp(toNum(state.costPerBedDay), 0, 1000000),
      costPerVRI: clamp(toNum(state.costPerVRI), 0, 10000000),
      capex: clamp(toNum(state.capex), 0, 100000000),
      opexYear: clamp(toNum(state.opexYear), 0, 100000000),
      capexAmortYears: clamp(toNum(state.capexAmortYears), 1, 20),
    };
  }, [state]);

  const result = useMemo(() => calc(parsed), [parsed]);

  const safetyNotes = useMemo(() => {
    const notes: string[] = [];

    if (!result.usedOverride && parsed.vriPer1000BedDays === 0) {
      notes.push("Du har satt VRI/1000 vårddygn till 0 och ingen override är angiven → kalkylen ger 0 infektioner.");
    }

    if (parsed.sinkAttributablePct <= 5) {
      notes.push("Handfatskoppling är satt mycket lågt (≤ 5%). Det är defensivt, men kan underskatta potentialen.");
    }

    if (parsed.effectPct <= 5) {
      notes.push("Effekt är satt mycket lågt (≤ 5%). Bra som worst-case-scenario.");
    }

    if (parsed.pricingMode === "bedDays" && parsed.costPerBedDay === 0) {
      notes.push("Kostnad per vårddygn är 0 → besparing blir 0 i vårddygnsläget.");
    }

    if (parsed.pricingMode === "perVRI" && parsed.costPerVRI === 0) {
      notes.push("Kostnad per VRI är 0 → besparing blir 0 i kostnad/VRI-läget.");
    }

    return notes;
  }, [parsed, result.usedOverride]);

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full bg-muted/30">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold">Handfat ROI-kalkylator (VRI · gramnegativa · vårddagar)</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">
                Beräkna potentialen: volymer → VRI → gramnegativa → handfatskopplade → undvikna infektioner → sparade vårddagar och kronor.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setState(defaults)}
                className="rounded-2xl"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Återställ
              </Button>
              <Button
                onClick={() => exportPDF(state, parsed, result)}
                className="rounded-2xl"
              >
                <Download className="h-4 w-4 mr-2" />
                Ladda ner rapport
              </Button>
            </div>
          </div>

          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Scenario</CardTitle>
              <CardDescription>
                Välj ett standardscenario för effekt. Du kan alltid justera manuellt efteråt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((s) => (
                  <Button
                    key={s.key}
                    variant={Math.round(parsed.effectPct) === s.effectPct ? "default" : "secondary"}
                    className="rounded-2xl"
                    onClick={() => setState((prev) => ({ ...prev, effectPct: s.effectPct }))}
                  >
                    {s.label}
                    <Badge variant="secondary" className="ml-2 rounded-xl">{s.effectPct}%</Badge>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Effekt = minskning av <span className="font-medium">handfatskopplade gramnegativa VRI</span>.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Indata</CardTitle>
                <CardDescription>Fyll i sjukhus/avdelningsdata. Använd egna siffror där det finns.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs defaultValue="volym" className="w-full">
                  <TabsList className="rounded-2xl">
                    <TabsTrigger value="volym" className="rounded-2xl">Volym</TabsTrigger>
                    <TabsTrigger value="infektion" className="rounded-2xl">Infektion</TabsTrigger>
                    <TabsTrigger value="kostnad" className="rounded-2xl">Kostnad</TabsTrigger>
                    <TabsTrigger value="produkt" className="rounded-2xl">Produkt</TabsTrigger>
                  </TabsList>

                  <TabsContent value="volym" className="mt-6 space-y-4">
                    <Field
                      id="beds"
                      label="Antal vårdplatser"
                      value={state.beds}
                      onChange={(v) => setState((p) => ({ ...p, beds: v }))}
                      helper="Antal bemannade platser i den enhet du räknar på."
                    />
                    <Field
                      id="occupancy"
                      label="Beläggning (%)"
                      value={state.occupancyPct}
                      onChange={(v) => setState((p) => ({ ...p, occupancyPct: v }))}
                      helper="Exempel: 92 för 92%."
                    />
                    <Field
                      id="alos"
                      label="Medelvårdtid (dygn)"
                      value={state.alosDays}
                      onChange={(v) => setState((p) => ({ ...p, alosDays: v }))}
                      helper="Används mest för rimlighetskoll (inte nödvändigt i grundformeln)."
                      right={
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="rounded-xl cursor-help">info</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Vi använder vårddygn (platser × 365 × beläggning) för volym. Medelvårdtid är för att kunna diskutera patientflöde i pitch.
                          </TooltipContent>
                        </Tooltip>
                      }
                    />
                  </TabsContent>

                  <TabsContent value="infektion" className="mt-6 space-y-4">
                    <Field
                      id="vriRate"
                      label="VRI per 1 000 vårddygn"
                      value={state.vriPer1000BedDays}
                      onChange={(v) => setState((p) => ({ ...p, vriPer1000BedDays: v }))}
                      helper="Om ni har egen VRI-rate per enhet. Annars kör defensiv schablon."
                    />
                    <Field
                      id="vriOverride"
                      label="Alternativt: VRI per år (override)"
                      value={state.vriPerYearOverride}
                      onChange={(v) => setState((p) => ({ ...p, vriPerYearOverride: v }))}
                      helper="Om du fyller i detta används det istället för VRI/1000 vårddygn. Lämna tomt för att använda rate."
                      right={result.usedOverride ? <Badge className="rounded-xl">använder override</Badge> : <Badge variant="secondary" className="rounded-xl">använder rate</Badge>}
                    />
                    <Separator />
                    <Field
                      id="gramNeg"
                      label="Andel gramnegativa VRI (%)"
                      value={state.gramNegPct}
                      onChange={(v) => setState((p) => ({ ...p, gramNegPct: v }))}
                      helper="Exempel: 35 = 35% av VRI är gramnegativa."
                    />
                    <Field
                      id="sinkAttr"
                      label="Andel gramnegativa VRI kopplade till handfat/miljö (%)"
                      value={state.sinkAttributablePct}
                      onChange={(v) => setState((p) => ({ ...p, sinkAttributablePct: v }))}
                      helper="Defensivt antagande. Du kan lägga detta lågt för att inte överdriva."
                    />
                    <Field
                      id="effect"
                      label="Effekt: minskning av handfatskopplade gramnegativa VRI (%)"
                      value={state.effectPct}
                      onChange={(v) => setState((p) => ({ ...p, effectPct: v }))}
                      helper="Scenario-knapparna ovan fyller detta åt dig, men du kan skriva själv."
                    />
                  </TabsContent>

                  <TabsContent value="kostnad" className="mt-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm">Prissättningsmodell</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={state.pricingMode === "bedDays" ? "default" : "secondary"}
                          className="rounded-2xl"
                          onClick={() => setState((p) => ({ ...p, pricingMode: "bedDays" }))}
                        >
                          Vårddygn
                        </Button>
                        <Button
                          size="sm"
                          variant={state.pricingMode === "perVRI" ? "default" : "secondary"}
                          className="rounded-2xl"
                          onClick={() => setState((p) => ({ ...p, pricingMode: "perVRI" }))}
                        >
                          Kostnad/VRI
                        </Button>
                      </div>
                    </div>
                    <Field
                      id="extraDays"
                      label="Extra vårddagar per VRI"
                      value={state.extraDaysPerVRI}
                      onChange={(v) => setState((p) => ({ ...p, extraDaysPerVRI: v }))}
                      helper="Hur många extra dygn en VRI typiskt ger. Använd gärna era egna siffror."
                    />
                    {state.pricingMode === "bedDays" ? (
                      <Field
                        id="costPerDay"
                        label="Kostnad per vårddygn (SEK)"
                        value={state.costPerBedDay}
                        onChange={(v) => setState((p) => ({ ...p, costPerBedDay: v }))}
                        helper="Schablon för kostnad per vårddygn."
                      />
                    ) : (
                      <Field
                        id="costPerVri"
                        label="Kostnad per VRI (SEK)"
                        value={state.costPerVRI}
                        onChange={(v) => setState((p) => ({ ...p, costPerVRI: v }))}
                        helper="All-in schablon för VRI (vårddygn, läkemedel, lab, IVA, etc.)."
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="produkt" className="mt-6 space-y-4">
                    <Field
                      id="capex"
                      label="Inköp + installation (CAPEX, SEK)"
                      value={state.capex}
                      onChange={(v) => setState((p) => ({ ...p, capex: v }))}
                      helper="Total investering för de handfat du räknar på (inkl. installation)."
                    />
                    <Field
                      id="opex"
                      label="Service/underhåll per år (OPEX, SEK/år)"
                      value={state.opexYear}
                      onChange={(v) => setState((p) => ({ ...p, opexYear: v }))}
                      helper="Årlig kostnad: filter, inspektion, spolning, reservdelar, etc."
                    />
                    <Field
                      id="amort"
                      label="Avskrivningstid (år)"
                      value={state.capexAmortYears}
                      onChange={(v) => setState((p) => ({ ...p, capexAmortYears: v }))}
                      helper="För att räkna årskostnad av CAPEX i ROI-beräkningen."
                    />
                  </TabsContent>
                </Tabs>

                {safetyNotes.length ? (
                  <div className="rounded-2xl border bg-muted/40 p-4">
                    <div className="text-sm font-medium">Rimlighetsnotiser</div>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc pl-5">
                      {safetyNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle>Resultat</CardTitle>
                <CardDescription>
                  Översikt: infektioner, vårddagar, kronor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Metric
                    title="Vårddygn per år"
                    value={fmtInt(result.bedDays)}
                    sub={`(platser ${fmtInt(parsed.beds)} · beläggning ${fmtPct(parsed.occupancyPct)})`}
                  />
                  <Metric
                    title="VRI per år"
                    value={fmt1(result.vri)}
                    sub={`≈ ${fmt1(result.vriPer1000)} per 1 000 vårddygn`}
                  />
                  <Metric
                    title="Gramnegativa VRI per år"
                    value={fmt1(result.gramNeg)}
                    sub={`andel gramnegativa: ${fmtPct(parsed.gramNegPct)}`}
                  />
                  <Metric
                    title="Handfatskopplade gramnegativa VRI"
                    value={fmt1(result.sinkGramNeg)}
                    sub={`handfatskoppling: ${fmtPct(parsed.sinkAttributablePct)}`}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Metric
                    title="Undvikna infektioner per år"
                    value={fmt1(result.avoided)}
                    sub={`effekt: ${fmtPct(parsed.effectPct)}`}
                  />
                  <Metric
                    title="Sparade vårddygn per år"
                    value={fmt1(result.savedBedDays)}
                    sub={`extra dygn/VRI: ${fmt1(parsed.extraDaysPerVRI)}`}
                  />
                  <Metric
                    title="Sparade kronor per år"
                    value={fmtMoneySEK(result.savedSEK)}
                    sub={state.pricingMode === "perVRI" ? `kostnad/VRI: ${fmtMoneySEK(parsed.costPerVRI)}` : `kostnad/vårddygn: ${fmtMoneySEK(parsed.costPerBedDay)}`}
                  />
                  <Metric
                    title="Årskostnad (CAPEX/år + OPEX)"
                    value={fmtMoneySEK(result.annualCost)}
                    sub={`CAPEX/${fmtInt(parsed.capexAmortYears)} år + OPEX/år`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Metric
                    title="Netto per år"
                    value={fmtMoneySEK(result.net)}
                    sub={result.net >= 0 ? "positivt" : "negativt"}
                  />
                  <Metric
                    title="Payback"
                    value={Number.isFinite(result.paybackYears) ? fmt1(result.paybackYears) + " år" : "–"}
                    sub="(CAPEX / (besparing − OPEX))"
                  />
                </div>

                <div className="rounded-2xl border p-4 bg-green-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Sammanfattning</div>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        Med antagandet {fmtPct(parsed.sinkAttributablePct)} handfatskoppling och {fmtPct(parsed.effectPct)} effekt undviks cirka <span className="font-medium">{fmt1(result.avoided)}</span> gramnegativa vårdrelaterade infektioner per år, vilket motsvarar <span className="font-medium">{fmt1(result.savedBedDays)}</span> sparade vårddygn och ungefär <span className="font-medium">{fmtMoneySEK(result.savedSEK)}</span> i årlig besparing.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium">Obs:</span> För kliniska beslut behövs lokala data, definitionsavgränsning (VRI-typ), och uppföljning.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
