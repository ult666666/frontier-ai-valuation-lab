#!/usr/bin/env python3
"""Create matching dated HTML/PDF research snapshots from the reviewed JSON data.

Run `npm run build` first, then `python3 scripts/build_report.py --pdf`.
HTML needs Python's standard library. PDF additionally needs ReportLab; fonts use
DejaVu when installed, with portable built-in font fallbacks.
"""
from __future__ import annotations

import argparse
from html import escape
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
RESEARCH = json.loads((ROOT / "data/research.json").read_text())
PRESETS = json.loads((ROOT / "data/presets.json").read_text())
SNAPSHOT = json.loads((PUBLIC / "data/current-results.json").read_text())
RESULTS = SNAPSHOT["cases"]
assert SNAPSHOT["modelVersion"] == RESEARCH["modelVersion"]
assert SNAPSHOT["valuationDate"] == RESEARCH["asOf"]
SOURCES = {s["id"]: s for s in RESEARCH["sources"]}


def money(value, digits=1):
    return f"{'−' if value < 0 else ''}${abs(value):,.{digits}f}B"


def number(value, digits=1):
    return f"{'−' if value < 0 else ''}{abs(value):,.{digits}f}"


def pct(value, digits=1):
    return f"{value * 100:,.{digits}f}%"


def paragraph(text, style="body"):
    return {"kind": "paragraph", "text": text, "style": style}


def table(headers, rows, widths=None):
    return {"kind": "table", "headers": headers, "rows": rows, "widths": widths}


def pages():
    a, o = RESULTS["Anthropic"]["Base"], RESULTS["OpenAI"]["Base"]
    yield ("01 / Research conclusion", "A valuation should be inspectable.", [
        paragraph("ANTHROPIC × OPENAI / FINAL REVIEW / MODEL 3.0.0", "eyebrow"),
        paragraph("Frontier AI Valuation Lab", "subtitle"),
        paragraph("Charles Dai · Independent fintech portfolio project · 18 October 2026", "small"),
        paragraph("The model connects revenue, economic operating profit, reinvestment and terminal returns. Its base scenarios imply operating enterprise values of " + money(a["ev"]) + " for Anthropic and " + money(o["ev"]) + " for OpenAI. These are conditional calculations under published assumptions, not verified security values or investment recommendations.", "lead"),
        table(["Operating EV · USD B", "Bear", "Base", "Bull"], [
            [company] + [number(RESULTS[company][case]["ev"]) for case in ("Bear", "Base", "Bull")]
            for company in ("Anthropic", "OpenAI")
        ], [0.37, 0.21, 0.21, 0.21]),
        paragraph("The range is intentionally wide. Scenario labels have no assigned probabilities. Negative continuation EV remains visible; it is not a negative share price and does not value an abandonment or restructuring option."),
        paragraph("What matters most", "heading"),
        paragraph(f"Terminal economics dominate. The present value of the perpetuity accounts for {pct(a['tv_share'])} of Anthropic Base EV and {pct(o['tv_share'])} of OpenAI Base EV. Near-term revenue momentum alone cannot settle the valuation question."),
        paragraph("Growth consumes capital. The model charges incremental sales for aggregate reinvestment and ties perpetual reinvestment to growth divided by ROIC. High sales growth can destroy value when margins and capital productivity are insufficient."),
        paragraph("Financing prices measure something different. Anthropic's completed Series H disclosed $965B post-money equity; OpenAI's closed round disclosed $852B post-money equity. Both remain dated reference points, without an invented current net-cash bridge. [S01] [S02]"),
        paragraph("Release scope: a shared browser/Node model, a real JSON API, independent Python arithmetic, an editable formula workbook, source provenance and a documented audit. Research and implementation used AI assistance; numerical conclusions are checked through reproducible calculations.", "small"),
    ])
    yield ("02 / Evidence quality", "Keep the quantities distinct.", [
        paragraph("Research cutoff: 18 October 2026, 09:22:26 PDT (16:22:26 UTC). This is a dated research snapshot. It does not continuously refresh company information.", "lead"),
        table(["Evidence", "Observed or reported basis", "Model treatment"], [
            ["Anthropic financing [S01]", "$65B Series H; $965B post-money, 28 May. Includes $15B previously committed hyperscaler investments.", "Retain equity label and date; do not add overlapping funding headlines or infer current cash."],
            ["OpenAI financing [S02]", "$122B committed capital; $852B post-money, 31 March. $4.7B credit facility undrawn at close.", "Committed capital is not current cash; an undrawn facility is not drawn debt."],
            ["Revenue periods [S04, S05, S18]", "Anthropic Q3 revenue $16.8B; Q2 $11.6B. OpenAI September annualized pace reported below about $50B.", "Quarterly actual-period reporting, annualized pace and FY assumptions retain distinct labels."],
            ["Proposed valuations [S03, S04]", "OpenAI $1.4T pre-money financing discussion; Anthropic investor IPO expectations around $1.5T.", "Uncompleted, attributed discussions; neither becomes the model's EV target."],
            ["Commercial terms [S10]", "April amendment ends Microsoft-to-OpenAI revenue share. The opposite direction continues through 2030 with an undisclosed cap.", "Do not reuse older reciprocal-sharing or exclusivity assumptions; no undisclosed rate is invented."],
            ["Compute commitments [S13, S14]", "Reported multiyear commitments and proposed infrastructure financing have different timing and legal forms.", "Do not subtract every commitment as debt while leaving associated operating costs and investment in FCFF."],
        ], [0.22, 0.40, 0.38]),
        paragraph("Revenue normalization needs both sides of the ledger", "heading"),
        paragraph("A gross-to-net presentation change can alter reported sales and percentage margins without changing dollar cash flows. A controlled accounting test scales starting revenue and capital turns by the same factor while inversely scaling margins; the model preserves EV. The test is an accounting illustration, not an estimate of either company's partner take rate. [S09]"),
        paragraph("Evidence that would materially improve the analysis: current unrestricted cash and funded debt; accounting-consistent revenue and operating profit; compute payment and lease schedules; taxable loss details; financing installment conditions; and investor preference or dilution terms. These are model information needs, not assumptions of disclosure.", "small"),
    ])
    fields = [
        ("FY2026 revenue · USD B", "rev2026", number),
        ("Growth 2027–2030", "g1", pct), ("Growth 2031–2033", "g2", pct),
        ("Growth 2034–2036", "g3", pct), ("Economic EBIT margin 2027", "m27", pct),
        ("Economic EBIT margin 2030", "m30", pct), ("Economic EBIT margin 2036", "m36", pct),
        ("Sales / invested capital", "turns", lambda v: f"{v:.2f}×"),
        ("Discount rate / assumed WACC", "wacc", pct), ("Perpetual growth", "tg", pct),
        ("Terminal ROIC", "roic", pct), ("Remaining-2026 economic FCFF · USD B", "stub", number),
        ("Tax rate on positive EBIT", "tax", pct),
    ]
    yield ("03 / Underwriting assumptions", "Make the forecast explicit.", [
        paragraph("All operating presets are retained from the reviewed October 16 model. The valuation date advances to October 18. This makes the final review's implementation changes distinguishable from a discretionary re-underwriting of the scenarios.", "lead"),
        table(["Base assumption", "Anthropic", "OpenAI"], [
            [label, fmt(PRESETS["Anthropic"]["Base"][key]), fmt(PRESETS["OpenAI"]["Base"][key])]
            for label, key, fmt in fields
        ], [0.58, 0.21, 0.21]),
        paragraph("Anthropic revenue bridge", "heading"),
        paragraph("Base FY2026 revenue of $53.26B combines reported Q1–Q3 of $4.7B, $11.6B and $16.8B with assumed Q4 of $20.16B. Bear Q4 equals Q3; Bull Q4 grows 40% sequentially. None is a full-year actual. [S18]"),
        paragraph("OpenAI revenue bridge", "heading"),
        paragraph("The $35B FY2026 Base starting point, with $32B/$38B alternatives, is an explicit analyst assumption retained from V2. The source record does not present it as company guidance. A September run-rate cannot determine the full-year total without a monthly revenue path. [S05]"),
        paragraph("The 2026 stub is the assumed remaining economic FCFF, not a proportional annual forecast or an observed cash balance. Both company models have a fixed 2036 explicit horizon. Growth, margin, capital efficiency, discount rate and terminal returns can be edited within the published input domain.", "small"),
    ])
    yield ("04 / Cash-flow diagnostics", "See what drives the value.", [
        table(["Base EV reconciliation · USD B", "Anthropic", "OpenAI"], [
            ["PV remaining-2026 FCFF", number(a["pv_stub"], 3), number(o["pv_stub"], 3)],
            ["PV 2027–2036 FCFF", number(a["pv_explicit"] - a["pv_stub"], 3), number(o["pv_explicit"] - o["pv_stub"], 3)],
            ["PV terminal value", number(a["pvtv"], 3), number(o["pvtv"], 3)],
            ["Operating enterprise value", number(a["ev"], 3), number(o["ev"], 3)],
        ], [0.58, 0.21, 0.21]),
        paragraph("The explicit subtotal in the API includes the stub. The table above separates it once to make the identity inspectable. The terminal value uses the same discount date as 2036 FCFF, with no extra year of discounting."),
        table(["Base diagnostic", "Anthropic", "OpenAI"], [
            ["2036 revenue · USD B", number(a["rows"][-1]["revenue"]), number(o["rows"][-1]["revenue"])],
            ["2036 economic FCFF · USD B", number(a["rows"][-1]["fcf"]), number(o["rows"][-1]["fcf"])],
            ["2037 terminal FCFF · USD B", number(a["terminal_fcf"]), number(o["terminal_fcf"])],
            ["Terminal FCFF change from 2036", pct(a["terminal_fcf_change"]), pct(o["terminal_fcf_change"])],
            ["Terminal reinvestment / NOPAT", pct(a["terminal_reinvestment_rate"]), pct(o["terminal_reinvestment_rate"])],
            ["Implied explicit incremental ROIC", pct(a["implied_incremental_roic"]), pct(o["implied_incremental_roic"])],
            ["Chosen terminal ROIC", pct(PRESETS["Anthropic"]["Base"]["roic"]), pct(PRESETS["OpenAI"]["Base"]["roic"])],
            ["Peak cumulative economic deficit · USD B", number(a["peak_funding_need"]), number(o["peak_funding_need"])],
        ], [0.58, 0.21, 0.21]),
        paragraph("Inspect the terminal transition", "heading"),
        paragraph("Explicit growth uses a sales-to-capital proxy; perpetual growth uses a separate terminal ROIC. Their difference changes reinvestment at the transition. The implied explicit return is stable margin × (1 − tax) × capital turns; exact next-year reinvestment equivalence also depends on the growth convention. A large jump is an assumption to investigate, not an arithmetic identity to hide."),
        paragraph("Treat the deficit as an operating stress measure", "heading"),
        paragraph("The most negative cumulative economic FCFF includes the stub and annual modeled flows. It is not a treasury funding requirement: opening liquidity, monthly cash timing, stock compensation, contractual payment schedules and financing mechanics are not fully modeled. Do not subtract this deficit again from EV.", "small"),
    ])
    yield ("05 / Calculation contract", "One model. Reproducible arithmetic.", [
        paragraph("Forecast revenue compounds in three growth stages. Margins interpolate from 2027 to 2030, then from 2030 to 2036. Taxes apply only to positive EBIT; there is no loss refund or modeled NOL asset.", "lead"),
        paragraph("Economic FCFF = revenue × economic EBIT margin − modeled tax − Δrevenue / capital turns", "formula"),
        paragraph("The aggregate net reinvestment proxy includes net capital expenditure, capitalized investment and working capital. Adding a second NWC or capex deduction without replacing the proxy would double count investment. Economic margins retain a cash-equivalent allowance for stock compensation."),
        paragraph("PV = FCFF / (1 + WACC)^(actual elapsed days / 365.25)", "formula"),
        paragraph("Discount the remaining-2026 input to 31 December 2026 and annual 2027–2036 flows to each year end. This release uses the calendar valuation date 18 October 2026. The 2036 horizon is fixed and visibly labeled."),
        paragraph("Terminal FCFF = 2037 NOPAT × (1 − terminal growth / terminal ROIC)", "formula"),
        paragraph("Terminal value = terminal FCFF / (WACC − terminal growth)", "formula"),
        paragraph("Perpetual growth requires capital. The stable-growth relation follows Damodaran's reinvestment/return framework. It does not establish company-specific inputs. Terminal growth must be nonnegative and below both the discount rate and ROIC. [S19]"),
        paragraph("Reverse DCF without a false monotonicity assumption", "heading"),
        paragraph("Holding other assumptions fixed, EV is a quartic polynomial in 1 + early growth. The solver partitions the 0–200% growth domain at derivative critical points, checks tangent and boundary roots, bisects sign changes and verifies each result through the forward calculation. It returns no solution, one solution or multiple solutions. A future NOL schedule or growth-dependent margin policy would require revisiting this algebra."),
        paragraph("Application and API controls", "heading"),
        paragraph("Every required input must be numeric, finite and in range. Unknown keys, blank inputs and invalid terminal relationships are rejected. The Node API limits request bodies to 16 KiB and sensitivity grids to 9 × 9. Browser calculations and the API share the production model; an independent Python implementation and hand-derived fixture check the arithmetic separately."),
        paragraph("A stateless backend is sufficient for a deterministic public model. Scenario saving stays in the visitor's browser. No paid API, account setup, database or private investor data is needed to run the project.", "small"),
    ])
    yield ("06 / Final fortification", "Turn failure cases into controls.", [
        paragraph("The final review preserved the previous terminal and date corrections, then tested custom-input behavior beyond the original preset checks. The resulting fixes are documented and reproducible.", "lead"),
        table(["Finding", "Why it mattered", "Release treatment"], [
            ["Multiple reverse solutions", "A valid low-margin case reaches $5B EV at two growth rates; the prior solver returned none.", "Enumerate admissible roots and expose multiple or unreachable outcomes. Include tangent-root regression."],
            ["Invalid spreadsheet turns", "V2 negative capital turns created investment inflows while arithmetic checks could still display PASS.", "Numeric/range/relationship checks suppress affected outputs. One authoritative scenario selector."],
            ["Numerical overflow", "A finite but enormous input could create Infinity or NaN.", "Magnitude limits plus calculated-output finiteness checks; typed API errors."],
            ["Unused horizon input", "An editable terminal year did not drive the workbook forecast.", "Remove the misleading control and label the fixed 2036 horizon."],
            ["Evidence ambiguity", "Financing, run-rate, accounting and commitments could be compared on incompatible bases.", "Dated source register, explicit assumptions, separate equity references and hypothetical bridge."],
        ], [0.24, 0.38, 0.38]),
        paragraph("Independent numerical evidence", "heading"),
        paragraph("The V2 baseline passed its existing 7 Python tests and 60 JavaScript assertions. Independent workbook review reconciled 1,164 cached values. These results established consistency, while the newly reproduced failures showed that consistency alone did not validate the input domain."),
        paragraph("V3 adds regressions for the demonstrated defects. An independent constant-growth fixture produces $200.314718645B EV. A separate deterministic numerical exercise recovered all 11,203 supported positive forward targets in a 20,000-scenario sample within 1e-6 of their known growth. The Python parity suite compares every forecast field under preset and varied economics."),
        paragraph("Release interpretation", "heading"),
        paragraph("This project is ready to demonstrate inspectable financial modeling and full stack engineering within its documented scope. It remains a simplified economic FCFF model with incomplete private-company information. No per-share valuation, probability-weighted target, investment advice or verified current balance sheet is claimed.", "small"),
    ])
    values = list(SOURCES.values())
    for index, start in enumerate(range(0, len(values), 7)):
        blocks = [paragraph("Each source has a defined use and an access or interpretation limit. Company disclosures, attributed reporting and methodology references are distinct evidence classes.", "small")]
        for source in values[start:start + 7]:
            blocks.extend([
                paragraph(f"[{source['id']}] {source['title']}", "heading"),
                paragraph(f"{source['publisher']} · {source['date']} · {source['type']}", "small"),
                paragraph(source["use"] + " " + source["limit"], "source"),
            ])
        yield (f"0{7 + index} / Source register", "Evidence you can inspect.", blocks)


PAGES = list(pages())


def markup(text, pdf=False):
    text = escape(str(text))
    def ref(match):
        ids = [i.strip() for i in match.group(1).split(",")]
        links = []
        for sid in ids:
            if sid not in SOURCES:
                continue
            url = escape(SOURCES[sid]["url"], quote=True)
            links.append(f'<a href="{url}"' + (' color="#16675E"' if pdf else ' target="_blank" rel="noopener noreferrer"') + f'>{sid}</a>')
        return "[" + ", ".join(links) + "]"
    return re.sub(r"\[(S\d+(?:, S\d+)*)\]", ref, text)


def html_report():
    style = """
    :root{--ink:#182b35;--muted:#596c73;--paper:#faf8f3;--line:#d9ded8;--teal:#16675e;--accent:#b76a4d}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,sans-serif}
    a{color:var(--teal);text-underline-offset:4px}header{padding:26px max(24px,calc((100vw - 1000px)/2));border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
    header strong{font-weight:650}nav{display:flex;gap:24px;font-size:14px}main{max-width:1000px;margin:auto;padding:38px 24px 80px}
    section{padding:38px 0 44px;border-bottom:1px solid var(--line)}.kicker,.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--teal);font-weight:700}
    h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.1;letter-spacing:-.035em}h1{font-size:clamp(45px,6vw,75px);max-width:790px}h2{font-size:clamp(34px,4vw,49px);margin:16px 0 30px}
    p{max-width:890px;margin:14px 0}.lead{font-size:19px;line-height:1.7}.subtitle{font-family:Georgia,serif;font-size:27px}.small,.source{font-size:13px;color:var(--muted)}.heading{font-weight:700;margin-top:26px}.formula{padding:15px 20px;background:#edf1eb;border-left:3px solid var(--teal);font-family:ui-monospace,monospace;font-size:14px}
    .table-wrap{overflow:auto;margin:24px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:13px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{background:var(--ink);color:white;font-weight:500}tbody tr:nth-child(even){background:#f0f2ec}td:first-child{font-weight:550}footer{padding:30px 24px;text-align:center;font-size:12px;color:var(--muted)}
    @media(max-width:600px){main{padding:15px 18px 50px}section{padding:28px 0}th,td{padding:10px;font-size:12px}.lead{font-size:17px}nav{gap:18px}}
    @media print{header,footer{display:none}body{background:white;font-size:10pt}main{padding:0}section{break-before:page;border:0;padding:0}section:first-child{break-before:auto}h1{font-size:35pt}h2{font-size:26pt}p{font-size:10pt}.lead{font-size:11pt}table{font-size:8pt}th,td{padding:7px}.table-wrap{overflow:visible}.formula{font-size:9pt}}
    """
    parts = [f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Final research and model review of an illustrative Anthropic and OpenAI economic FCFF valuation."><title>Research &amp; Audit Review · Frontier AI Valuation Lab</title><style>{style}</style></head><body>',
             '<header><strong>Frontier AI Valuation Lab</strong><nav aria-label="Report navigation"><a href="./index.html">Open workstation</a><a href="./downloads/Frontier_AI_Valuation_Review.pdf">PDF review</a><a href="./downloads/Frontier_AI_Valuation_Model.xlsx">Excel model</a></nav></header><main>']
    for index, (label, title, blocks) in enumerate(PAGES):
        level = 1 if index == 0 else 2
        parts.append(f'<section aria-labelledby="section-{index}"><div class="kicker">{escape(label)}</div><h{level} id="section-{index}">{escape(title)}</h{level}>')
        for block in blocks:
            if block["kind"] == "paragraph":
                parts.append(f'<p class="{block["style"]}">{markup(block["text"])}</p>')
            else:
                parts.append('<div class="table-wrap" tabindex="0"><table><thead><tr>' + ''.join(f'<th scope="col">{markup(h)}</th>' for h in block["headers"]) + '</tr></thead><tbody>')
                parts.extend('<tr>' + ''.join(f'<td>{markup(v)}</td>' for v in row) + '</tr>' for row in block["rows"])
                parts.append('</tbody></table></div>')
        parts.append('</section>')
    parts.append('<footer>Charles Dai · Independent educational research · Model 3.0.0 · USD billions · 18 October 2026<br>Source publications and company names remain the property of their respective owners.</footer></main></body></html>')
    output = PUBLIC / "report.html"
    output.write_text('\n'.join(parts), encoding="utf-8")
    print(f"Created {output.relative_to(ROOT)}")


def pdf_report():
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

    font_dir = Path("/usr/share/fonts/truetype/dejavu")
    regular, bold, serif = "Helvetica", "Helvetica-Bold", "Times-Roman"
    if (font_dir / "DejaVuSans.ttf").exists():
        for name, filename in (("Body", "DejaVuSans.ttf"), ("BodyBold", "DejaVuSans-Bold.ttf"), ("Display", "DejaVuSerif.ttf")):
            pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
        regular, bold, serif = "Body", "BodyBold", "Display"
    ink, teal, muted, line = map(colors.HexColor, ("#182B35", "#16675E", "#596C73", "#D9DED8"))
    styles = {
        "body": ParagraphStyle("body", fontName=regular, fontSize=9.1, leading=14, textColor=ink, spaceAfter=9),
        "lead": ParagraphStyle("lead", fontName=regular, fontSize=10.3, leading=15.7, textColor=ink, spaceAfter=13),
        "small": ParagraphStyle("small", fontName=regular, fontSize=7.8, leading=11.5, textColor=muted, spaceAfter=9),
        "source": ParagraphStyle("source", fontName=regular, fontSize=8.2, leading=12, textColor=ink, spaceAfter=13),
        "heading": ParagraphStyle("heading", fontName=bold, fontSize=9.6, leading=14, textColor=ink, spaceBefore=8, spaceAfter=5, keepWithNext=True),
        "formula": ParagraphStyle("formula", fontName=regular, fontSize=8.7, leading=14, textColor=teal, backColor=colors.HexColor("#EDF1EB"), borderPadding=9, spaceBefore=7, spaceAfter=17),
        "eyebrow": ParagraphStyle("eyebrow", fontName=bold, fontSize=7.4, leading=11, textColor=teal, spaceAfter=6),
        "subtitle": ParagraphStyle("subtitle", fontName=serif, fontSize=19, leading=24, textColor=ink, spaceAfter=8),
        "title": ParagraphStyle("title", fontName=serif, fontSize=29, leading=35, textColor=ink, spaceBefore=10, spaceAfter=22),
        "cell": ParagraphStyle("cell", fontName=regular, fontSize=8, leading=11.5, textColor=ink, alignment=TA_LEFT),
        "tablehead": ParagraphStyle("tablehead", fontName=bold, fontSize=7.8, leading=11, textColor=colors.white),
    }
    width, height = A4
    output = PUBLIC / "downloads/Frontier_AI_Valuation_Review.pdf"
    output.parent.mkdir(exist_ok=True)
    doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=57, bottomMargin=48,
                            title="Frontier AI Valuation Lab — Final Research & Model Review", author="Charles Dai",
                            subject="Illustrative Anthropic and OpenAI economic FCFF valuation; model 3.0.0")
    content_width = width - 96
    story = []
    for page_index, (label, title, blocks) in enumerate(PAGES):
        if page_index:
            story.append(PageBreak())
        story.extend([Paragraph(escape(label.upper()), styles["eyebrow"]), Paragraph(escape(title), styles["title"])])
        for block in blocks:
            if block["kind"] == "paragraph":
                story.append(Paragraph(markup(block["text"], pdf=True), styles[block["style"]]))
            else:
                data = [[Paragraph(markup(h, pdf=True), styles["tablehead"]) for h in block["headers"]]]
                data += [[Paragraph(markup(v, pdf=True), styles["cell"]) for v in row] for row in block["rows"]]
                widths = [content_width * value for value in block["widths"]] if block["widths"] else None
                t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), ink), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LINEBELOW", (0, 1), (-1, -1), .4, line),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F3ED")]),
                ]))
                story.extend([Spacer(1, 5), t, Spacer(1, 13)])

    def frame(canvas, document):
        canvas.saveState()
        canvas.setFillColor(ink)
        canvas.setFont(bold, 7.7)
        canvas.drawString(48, height - 31, "FRONTIER AI VALUATION LAB")
        canvas.setFont(regular, 7.1)
        canvas.setFillColor(muted)
        canvas.drawRightString(width - 48, height - 31, "RESEARCH & MODEL REVIEW  /  18 OCT 2026")
        canvas.setStrokeColor(line)
        canvas.line(48, 36, width - 48, 36)
        canvas.setFont(regular, 6.6)
        canvas.drawString(48, 23, "Charles Dai  ·  Independent educational research  ·  USD billions  ·  v3.0.0")
        canvas.drawRightString(width - 48, 23, f"{document.page:02d}")
        canvas.restoreState()
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    print(f"Created {output.relative_to(ROOT)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", action="store_true")
    args = parser.parse_args()
    html_report()
    if args.pdf:
        pdf_report()
