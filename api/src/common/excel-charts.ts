import JSZip = require('jszip');
import type { ReportSheet } from './excel-report';

const xml = (v: unknown) =>
  String(v ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[c]!,
    );
const column = (index: number) => {
  let n = index + 1,
    s = '';
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};
const colors = [
  '167D9A',
  'F59E0B',
  '2563EB',
  '16A34A',
  '9333EA',
  'EF4444',
  '14B8A6',
  'EC4899',
];
const relNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const docRel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const drawingNS = 'http://schemas.openxmlformats.org/drawingml/2006';

/** Native OOXML charts reference cells; Excel renders text and updates edited values. */
export async function addNativeCharts(
  buffer: Buffer,
  sheets: ReportSheet[],
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let types = await zip.file('[Content_Types].xml')!.async('string');
  for (const [index, spec] of sheets.entries()) {
    if (!spec.chart || !spec.rows.length) continue;
    const chart = spec.chart;
    const rows = spec.rows.slice(0, chart.limit || 12);
    const kind = chart.type || 'bar';
    // Pie charts cannot represent negative values or an empty total.
    if (
      kind === 'pie' &&
      (rows.some((r) => Number(r[chart.value]) < 0) ||
        !rows.some((r) => Number(r[chart.value]) > 0))
    )
      continue;
    const id = index + 1;
    const sheetName = `'${spec.name.replace(/'/g, "''")}'`;
    const ref = (col: number) =>
      xml(`${sheetName}!$${column(col)}$6:$${column(col)}$${rows.length + 5}`);
    const cats = rows
      .map(
        (r, i) => `<c:pt idx="${i}"><c:v>${xml(r[chart.label])}</c:v></c:pt>`,
      )
      .join('');
    const series = (
      chart.series || [{ name: spec.headers[chart.value], value: chart.value }]
    )
      .map((s, i) => {
        const values = rows
          .map(
            (r, j) =>
              `<c:pt idx="${j}"><c:v>${Number.isFinite(Number(r[s.value])) ? Number(r[s.value]) : 0}</c:v></c:pt>`,
          )
          .join('');
        const shape =
          kind === 'pie'
            ? rows
                .map(
                  (_, j) =>
                    `<c:dPt><c:idx val="${j}"/><c:spPr><a:solidFill><a:srgbClr val="${colors[j % colors.length]}"/></a:solidFill></c:spPr></c:dPt>`,
                )
                .join('')
            : `<c:spPr>${kind === 'line' ? `<a:ln w="28575"><a:solidFill><a:srgbClr val="${colors[i % colors.length]}"/></a:solidFill></a:ln>` : `<a:solidFill><a:srgbClr val="${colors[i % colors.length]}"/></a:solidFill><a:ln><a:noFill/></a:ln>`}</c:spPr>`;
        return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xml(s.name)}</c:v></c:tx>${shape}${kind === 'line' ? `<c:marker><c:symbol val="${rows.length > 31 ? 'none' : 'circle'}"/><c:size val="4"/></c:marker>` : ''}<c:cat><c:strRef><c:f>${ref(chart.label)}</c:f><c:strCache><c:ptCount val="${rows.length}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${ref(s.value)}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${rows.length}"/>${values}</c:numCache></c:numRef></c:val>${kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
      })
      .join('');
    const axes =
      kind === 'pie'
        ? ''
        : `<c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${kind === 'bar' ? 'l' : 'b'}"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${kind === 'line' ? `<c:tickLblSkip val="${Math.max(1, Math.ceil(rows.length / 8))}"/><c:tickMarkSkip val="${Math.max(1, Math.ceil(rows.length / 8))}"/>` : ''}</c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${kind === 'bar' ? 'b' : 'l'}"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
    const plot =
      kind === 'pie'
        ? `<c:pieChart><c:varyColors val="1"/>${series}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls><c:firstSliceAng val="270"/></c:pieChart>`
        : kind === 'line'
          ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:smooth val="0"/><c:axId val="100"/><c:axId val="200"/></c:lineChart>`
          : `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="65"/><c:overlap val="0"/><c:axId val="100"/><c:axId val="200"/></c:barChart>`;
    const title = `${chart.title}${spec.rows.length > rows.length ? ` (primeros ${rows.length})` : ''}`;
    zip.file(
      `xl/charts/chart${id}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${drawingNS}/chart" xmlns:a="${drawingNS}/main" xmlns:r="${docRel}"><c:lang val="es-CO"/><c:roundedCorners val="0"/><c:style val="10"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1600" b="1"/></a:pPr><a:r><a:rPr lang="es-CO"/><a:t>${xml(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${kind === 'pie' || (chart.series?.length || 0) > 1 ? '<c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100"><a:solidFill><a:srgbClr val="15324F"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr></c:chartSpace>`,
    );
    const col = Math.max(spec.headers.length, 2) + 1;
    zip.file(
      `xl/drawings/drawing${id}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${drawingNS}/spreadsheetDrawing" xmlns:a="${drawingNS}/main"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col + 13}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>29</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${xml(title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${drawingNS}/chart"><c:chart xmlns:c="${drawingNS}/chart" xmlns:r="${docRel}" r:id="rIdChart"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
    );
    zip.file(
      `xl/drawings/_rels/drawing${id}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${relNS}"><Relationship Id="rIdChart" Type="${docRel}/chart" Target="../charts/chart${id}.xml"/></Relationships>`,
    );
    const sheetPath = `xl/worksheets/sheet${id}.xml`;
    zip.file(
      sheetPath,
      (await zip.file(sheetPath)!.async('string')).replace(
        '</worksheet>',
        '<drawing r:id="rIdPowerPosChart"/></worksheet>',
      ),
    );
    const relPath = `xl/worksheets/_rels/sheet${id}.xml.rels`;
    const rel = zip.file(relPath)
      ? await zip.file(relPath)!.async('string')
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${relNS}"></Relationships>`;
    zip.file(
      relPath,
      rel.replace(
        '</Relationships>',
        `<Relationship Id="rIdPowerPosChart" Type="${docRel}/drawing" Target="../drawings/drawing${id}.xml"/></Relationships>`,
      ),
    );
    types = types.replace(
      '</Types>',
      `<Override PartName="/xl/charts/chart${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
    );
  }
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
