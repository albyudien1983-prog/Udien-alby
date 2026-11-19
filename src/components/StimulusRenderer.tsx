import React from 'react';
import { BookOpen, ImageIcon } from 'lucide-react';
import type { StimulusData } from '../types.ts';

interface StimulusRendererProps {
  stimulus?: StimulusData;
  compact?: boolean;
}

export const StimulusRenderer: React.FC<StimulusRendererProps> = ({ stimulus, compact = false }) => {
  if (!stimulus || stimulus.type === 'none') {
    return null;
  }

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/70 ${
        compact ? 'p-3.5 text-sm' : 'p-5'
      } space-y-3`}
    >
      {stimulus.title && (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F2547]">
          <BookOpen className="h-4 w-4 text-sky-600 shrink-0" />
          <span>{stimulus.title}</span>
        </div>
      )}

      {stimulus.type === 'bacaan' && stimulus.content && (
        <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-700 whitespace-pre-line">
          {stimulus.content}
        </div>
      )}

      {stimulus.type === 'tabel' && stimulus.tableHeaders && stimulus.tableRows && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#0F2547] text-white">
                {stimulus.tableHeaders.map((header, idx) => (
                  <th
                    key={idx}
                    className="px-3.5 py-2.5 text-left font-semibold whitespace-nowrap border-b border-slate-200"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stimulus.tableRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3.5 py-2 text-slate-700 border-b border-slate-100 tabular-nums"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stimulus.type === 'diagram_batang' && stimulus.chartData && stimulus.chartData.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {(() => {
            const maxVal = Math.max(...stimulus.chartData.map((d) => d.value), 10);
            const yMax = Math.ceil(maxVal / 10) * 10;
            const width = 460;
            const height = 220;
            const padLeft = 42;
            const padBottom = 34;
            const padTop = 20;
            const padRight = 16;
            const plotW = width - padLeft - padRight;
            const plotH = height - padTop - padBottom;
            const barSlot = plotW / stimulus.chartData.length;
            const barW = Math.min(44, barSlot * 0.56);
            const ticks = [0, 0.25, 0.5, 0.75, 1];

            return (
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full max-w-lg h-auto mx-auto"
                role="img"
                aria-label={stimulus.title || 'Diagram Batang'}
              >
                {ticks.map((t, i) => {
                  const y = padTop + plotH * (1 - t);
                  const val = Math.round(yMax * t);
                  return (
                    <g key={i}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={width - padRight}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray={t === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#64748b"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}
                {stimulus.chartData.map((d, idx) => {
                  const barH = (d.value / yMax) * plotH;
                  const x = padLeft + idx * barSlot + (barSlot - barW) / 2;
                  const y = padTop + plotH - barH;
                  return (
                    <g key={idx}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx="5"
                        fill={idx % 2 === 0 ? '#0284C7' : '#0F2547'}
                      />
                      <text
                        x={x + barW / 2}
                        y={y - 6}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill="#0F2547"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {d.value}
                      </text>
                      <text
                        x={x + barW / 2}
                        y={height - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#334155"
                        fontWeight="500"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
      )}

      {stimulus.type === 'bangun_datar' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col items-center gap-2">
          {stimulus.geometryKind === 'taman_lingkaran' ? (
            <svg viewBox="0 0 260 170" className="w-64 h-auto" role="img" aria-label="Ilustrasi Lingkaran">
              <circle cx="130" cy="85" r="64" fill="#ECFDF5" stroke="#059669" strokeWidth="2.5" />
              <line x1="66" y1="85" x2="194" y2="85" stroke="#0F2547" strokeWidth="2" strokeDasharray="5 4" />
              <circle cx="130" cy="85" r="3.5" fill="#0F2547" />
              <text x="130" y="75" textAnchor="middle" fontSize="12" fontWeight="600" fill="#0F2547">
                {stimulus.geometryLabels?.[0] || 'd = 14 m'}
              </text>
            </svg>
          ) : (
            <svg viewBox="0 0 340 175" className="w-80 h-auto" role="img" aria-label="Ilustrasi Bangun Datar Gabungan">
              <rect x="40" y="42" width="180" height="100" fill="#E0F2FE" stroke="#0284C7" strokeWidth="2.5" />
              <polygon points="220,42 295,92 220,142" fill="#FEF3C7" stroke="#EA580C" strokeWidth="2.5" />
              <line x1="220" y1="92" x2="295" y2="92" stroke="#0F2547" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="130" y="32" textAnchor="middle" fontSize="12" fontWeight="600" fill="#0F2547">
                p = {stimulus.geometryLabels?.[0] || '14 m'}
              </text>
              <text x="26" y="96" textAnchor="middle" fontSize="12" fontWeight="600" fill="#0F2547">
                {stimulus.geometryLabels?.[1] || '8 m'}
              </text>
              <text x="256" y="84" textAnchor="middle" fontSize="11" fontWeight="600" fill="#9A3412">
                t = {stimulus.geometryLabels?.[2] || '6 m'}
              </text>
            </svg>
          )}
          {stimulus.formula && (
            <div className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
              {stimulus.formula}
            </div>
          )}
        </div>
      )}

      {stimulus.type === 'bangun_ruang' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col items-center gap-2">
          <svg viewBox="0 0 320 190" className="w-72 h-auto" role="img" aria-label="Ilustrasi Bangun Ruang Balok">
            {/* Back edges */}
            <polygon points="95,35 255,35 255,120 95,120" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" />
            {/* Water level 3/4 */}
            <polygon points="55,82 215,82 255,54 95,54" fill="#BAE6FD" fillOpacity="0.6" />
            <polygon points="55,82 215,82 215,148 55,148" fill="#38BDF8" fillOpacity="0.35" />
            <polygon points="215,82 255,54 255,120 215,148" fill="#0284C7" fillOpacity="0.25" />
            {/* Front & isometric box edges */}
            <rect x="55" y="62" width="160" height="86" fill="none" stroke="#0F2547" strokeWidth="2.2" />
            <polygon points="55,62 95,35 255,35 215,62" fill="none" stroke="#0F2547" strokeWidth="2.2" />
            <polygon points="215,62 255,35 255,120 215,148" fill="none" stroke="#0F2547" strokeWidth="2.2" />
            <text x="135" y="168" textAnchor="middle" fontSize="12" fontWeight="600" fill="#0F2547">
              p = {stimulus.geometryLabels?.[0] || '80 cm'}
            </text>
            <text x="248" y="144" textAnchor="start" fontSize="12" fontWeight="600" fill="#0F2547">
              l = {stimulus.geometryLabels?.[1] || '40 cm'}
            </text>
            <text x="42" y="108" textAnchor="end" fontSize="12" fontWeight="600" fill="#0F2547">
              {stimulus.geometryLabels?.[2] || '50 cm'}
            </text>
          </svg>
          {stimulus.formula && (
            <div className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
              {stimulus.formula}
            </div>
          )}
        </div>
      )}

      {stimulus.type === 'gambar' && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col items-center gap-2">
          {stimulus.imageUrl ? (
            <img
              src={stimulus.imageUrl}
              alt={stimulus.title || 'Ilustrasi Soal'}
              referrerPolicy="no-referrer"
              className="max-h-64 w-auto rounded-md object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-6 text-slate-400">
              <ImageIcon className="h-8 w-8 mb-1.5" />
              <span className="text-xs">Ilustrasi gambar belum tersedia</span>
            </div>
          )}
          {stimulus.content && (
            <p className="text-sm text-slate-600 text-center">{stimulus.content}</p>
          )}
        </div>
      )}
    </div>
  );
};
