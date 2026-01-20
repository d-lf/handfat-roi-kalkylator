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
import { Slider } from "@/components/ui/slider";
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
  { key: "low", label: "Lågt (10%)", effectPct: 10, tag: "Defensivt" },
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
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} type={type} className="rounded-xl" />
      {helper ? <p className="text-xs text-muted-foreground leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function SliderField({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  step = 1, 
  unit = "",
  helper,
  formatValue
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  helper?: string;
  formatValue?: (v: number) => string;
}) {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-medium tabular-nums bg-muted px-3 py-1 rounded-lg min-w-[80px] text-center">
          {displayValue}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      {helper ? <p className="text-xs text-muted-foreground leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function Metric({ title, value, sub, highlight }: { title: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${highlight ? 'bg-green-50 border-green-200' : 'bg-background hover:bg-muted/30'}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${highlight ? 'text-green-700' : ''}`}>{value}</div>
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
                Välj antagande för förväntad effekt. Du kan alltid justera manuellt i indata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scenarios.map((s) => {
                  const isSelected = Math.round(parsed.effectPct) === s.effectPct;
                  return (
                    <button
                      key={s.key}
                      className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'
                      }`}
                      onClick={() => setState((prev) => ({ ...prev, effectPct: s.effectPct }))}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${isSelected ? 'text-primary' : ''}`}>{s.label}</span>
                        <span className={`text-lg font-bold ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>{s.effectPct}%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{s.tag}</span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Effekt = förväntad minskning av handfatskopplade gramnegativa VRI.
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

                  <TabsContent value="volym" className="mt-6 space-y-6">
                    <SliderField
                      label="Antal vårdplatser"
                      value={parsed.beds}
                      onChange={(v) => setState((p) => ({ ...p, beds: v }))}
                      min={1}
                      max={200}
                      step={1}
                      unit=" st"
                      helper="Antal bemannade platser i den enhet du räknar på."
                    />
                    <SliderField
                      label="Beläggning"
                      value={parsed.occupancyPct}
                      onChange={(v) => setState((p) => ({ ...p, occupancyPct: v }))}
                      min={50}
                      max={100}
                      step={1}
                      unit="%"
                      helper="Genomsnittlig beläggningsgrad på avdelningen."
                    />
                    <SliderField
                      label="Medelvårdtid"
                      value={parsed.alosDays}
                      onChange={(v) => setState((p) => ({ ...p, alosDays: v }))}
                      min={1}
                      max={30}
                      step={0.5}
                      unit=" dygn"
                      helper="Används för rimlighetskoll och diskussion om patientflöde."
                    />
                  </TabsContent>

                  <TabsContent value="infektion" className="mt-6 space-y-5">
                    <Field
                      id="vriRate"
                      label="VRI per 1 000 vårddygn"
                      value={state.vriPer1000BedDays}
                      onChange={(v) => setState((p) => ({ ...p, vriPer1000BedDays: v }))}
                      helper="Infektionsrate. Använd er egen data om ni har."
                    />
                    <Field
                      id="vriOverride"
                      label="Alternativt: VRI per år (exakt antal)"
                      value={state.vriPerYearOverride}
                      onChange={(v) => setState((p) => ({ ...p, vriPerYearOverride: v }))}
                      helper="Fyll i om du vet exakt antal VRI per år. Lämna tomt för att beräkna från rate."
                      right={result.usedOverride ? <Badge className="rounded-xl bg-green-100 text-green-800">aktiv</Badge> : null}
                    />
                    <Separator className="my-2" />
                    <Field
                      id="gramNeg"
                      label="Andel gramnegativa VRI (%)"
                      value={state.gramNegPct}
                      onChange={(v) => setState((p) => ({ ...p, gramNegPct: v }))}
                      helper="Hur stor andel av VRI som är gramnegativa bakterier."
                    />
                    <Field
                      id="sinkAttr"
                      label="Handfatskoppling (%)"
                      value={state.sinkAttributablePct}
                      onChange={(v) => setState((p) => ({ ...p, sinkAttributablePct: v }))}
                      helper="Andel av gramnegativa VRI som kan kopplas till handfat/avlopp."
                    />
                    <Field
                      id="effect"
                      label="Effekt - förväntad minskning (%)"
                      value={state.effectPct}
                      onChange={(v) => setState((p) => ({ ...p, effectPct: v }))}
                      helper="Förväntad minskning av handfatskopplade gramnegativa VRI."
                    />
                  </TabsContent>

                  <TabsContent value="kostnad" className="mt-6 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-sm">Prissättningsmodell</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={state.pricingMode === "bedDays" ? "default" : "outline"}
                          className="rounded-xl flex-1"
                          onClick={() => setState((p) => ({ ...p, pricingMode: "bedDays" }))}
                        >
                          Per vårddygn
                        </Button>
                        <Button
                          size="sm"
                          variant={state.pricingMode === "perVRI" ? "default" : "outline"}
                          className="rounded-xl flex-1"
                          onClick={() => setState((p) => ({ ...p, pricingMode: "perVRI" }))}
                        >
                          Per VRI
                        </Button>
                      </div>
                    </div>
                    <SliderField
                      label="Extra vårddagar per VRI"
                      value={parsed.extraDaysPerVRI}
                      onChange={(v) => setState((p) => ({ ...p, extraDaysPerVRI: v }))}
                      min={1}
                      max={20}
                      step={1}
                      unit=" dygn"
                      helper="Hur många extra dygn en VRI typiskt medför."
                    />
                    {state.pricingMode === "bedDays" ? (
                      <SliderField
                        label="Kostnad per vårddygn"
                        value={parsed.costPerBedDay}
                        onChange={(v) => setState((p) => ({ ...p, costPerBedDay: v }))}
                        min={5000}
                        max={25000}
                        step={500}
                        formatValue={(v) => `${(v / 1000).toFixed(0)}k kr`}
                        helper="Genomsnittlig kostnad per vårddygn."
                      />
                    ) : (
                      <SliderField
                        label="Kostnad per VRI"
                        value={parsed.costPerVRI}
                        onChange={(v) => setState((p) => ({ ...p, costPerVRI: v }))}
                        min={30000}
                        max={200000}
                        step={5000}
                        formatValue={(v) => `${(v / 1000).toFixed(0)}k kr`}
                        helper="Total kostnad per VRI (vårddygn, läkemedel, lab, IVA, etc.)."
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="produkt" className="mt-6 space-y-5">
                    <Field
                      id="capex"
                      label="Investering (CAPEX, SEK)"
                      value={state.capex}
                      onChange={(v) => setState((p) => ({ ...p, capex: v }))}
                      helper="Total investering för handfat inkl. installation."
                    />
                    <Field
                      id="opex"
                      label="Årlig driftkostnad (OPEX, SEK/år)"
                      value={state.opexYear}
                      onChange={(v) => setState((p) => ({ ...p, opexYear: v }))}
                      helper="Filter, inspektion, spolning, reservdelar, etc."
                    />
                    <SliderField
                      label="Avskrivningstid"
                      value={parsed.capexAmortYears}
                      onChange={(v) => setState((p) => ({ ...p, capexAmortYears: v }))}
                      min={1}
                      max={15}
                      step={1}
                      unit=" år"
                      helper="Tid för att skriva av investeringen."
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
                    highlight={result.avoided >= 1}
                  />
                  <Metric
                    title="Sparade vårddygn per år"
                    value={fmt1(result.savedBedDays)}
                    sub={`extra dygn/VRI: ${fmt1(parsed.extraDaysPerVRI)}`}
                    highlight={result.savedBedDays >= 5}
                  />
                  <Metric
                    title="Sparade kronor per år"
                    value={fmtMoneySEK(result.savedSEK)}
                    sub={state.pricingMode === "perVRI" ? `kostnad/VRI: ${fmtMoneySEK(parsed.costPerVRI)}` : `kostnad/vårddygn: ${fmtMoneySEK(parsed.costPerBedDay)}`}
                    highlight={result.savedSEK > result.annualCost}
                  />
                  <Metric
                    title="Årskostnad (CAPEX/år + OPEX)"
                    value={fmtMoneySEK(result.annualCost)}
                    sub={`avskrivning över ${fmtInt(parsed.capexAmortYears)} år`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Metric
                    title="Netto per år"
                    value={fmtMoneySEK(result.net)}
                    sub={result.net >= 0 ? "positivt resultat" : "negativt resultat"}
                    highlight={result.net > 0}
                  />
                  <Metric
                    title="Payback"
                    value={Number.isFinite(result.paybackYears) ? fmt1(result.paybackYears) + " år" : "–"}
                    sub="tid till återbetald investering"
                    highlight={Number.isFinite(result.paybackYears) && result.paybackYears <= 5}
                  />
                </div>

                <div className="rounded-2xl border border-green-200 p-5 bg-gradient-to-br from-green-50 to-emerald-50">
                  <div className="text-sm font-semibold text-green-800 mb-3">Sammanfattning</div>
                  <p className="text-sm text-green-900/80 leading-relaxed">
                    Med antagandet <span className="font-semibold text-green-800">{fmtPct(parsed.sinkAttributablePct)}</span> handfatskoppling och <span className="font-semibold text-green-800">{fmtPct(parsed.effectPct)}</span> effekt undviks cirka <span className="font-semibold text-green-800">{fmt1(result.avoided)}</span> gramnegativa vårdrelaterade infektioner per år, vilket motsvarar <span className="font-semibold text-green-800">{fmt1(result.savedBedDays)}</span> sparade vårddygn och ungefär <span className="font-semibold text-green-800">{fmtMoneySEK(result.savedSEK)}</span> i årlig besparing.
                  </p>
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
