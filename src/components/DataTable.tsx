import React, { useMemo, useState, useEffect } from 'react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Link2,
  Plus,
  Archive,
} from 'lucide-react';
import {
  CollectionData,
  ColumnFilter,
  DecodedRow,
  exportRowsToCsv,
  FilterOperator,
  formatMicrosToDate,
  isLikelyMicrosTimestamp,
  queryRows,
  rowToPlainJson,
  SortConfig,
} from '../core/isarDatabase';
import { IsarPropertySchema, IsarValue } from '../core/isarDecoder';

interface DataTableProps {
  collection: CollectionData;
  selectedRowId: string | null;
  onSelectRow: (row: DecodedRow) => void;
  onOpenExportZip?: () => void;
}

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'is_null', label: 'is null' },
  { value: 'not_null', label: 'is not null' },
];

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const DataTable: React.FC<DataTableProps> = ({
  collection,
  selectedRowId,
  onSelectRow,
  onOpenExportZip,
}) => {
  const activeProps = useMemo(
    () => collection.schema.properties.filter((p): p is IsarPropertySchema & { name: string } => p.name !== null),
    [collection]
  );

  const [globalSearch, setGlobalSearch] = useState('');
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [sort, setSort] = useState<SortConfig | null>({ field: '__id__', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Column visibility and timestamp toggles
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [dateCols, setDateCols] = useState<Set<string>>(new Set());

  // Popovers
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Filter draft
  const [draftField, setDraftField] = useState<string>('__id__');
  const [draftOp, setDraftOp] = useState<FilterOperator>('contains');
  const [draftVal, setDraftVal] = useState<string>('');

  const prevColNameRef = React.useRef<string>(collection.schema.name);

  // Auto-detect likely microsecond DateTime Long columns on collection switch
  useEffect(() => {
    // Only reset search, filters, and pagination when switching to a DIFFERENT collection
    if (prevColNameRef.current !== collection.schema.name) {
      prevColNameRef.current = collection.schema.name;
      setGlobalSearch('');
      setFilters([]);
      setSort({ field: '__id__', direction: 'asc' });
      setPage(1);
      setHiddenCols(new Set());
      setDraftField('__id__');
    }

    const autoDates = new Set<string>();
    const sampleRows = collection.rows.slice(0, 15);
    for (const prop of activeProps) {
      if (prop.type === 'DateTime') {
        autoDates.add(prop.name);
      } else if (prop.type === 'Long') {
        const nameHint = /(At|Date|Time|Timestamp)$/i.test(prop.name);
        const vals = sampleRows.map((r) => r.fields[prop.name]).filter((v) => v !== null && v !== undefined);
        if (vals.length > 0 && vals.every((v) => isLikelyMicrosTimestamp(v)) && (nameHint || vals.length >= 2)) {
          autoDates.add(prop.name);
        } else if (nameHint && vals.some((v) => isLikelyMicrosTimestamp(v))) {
          autoDates.add(prop.name);
        }
      }
    }
    setDateCols(autoDates);
  }, [collection.schema.name]);

  const filteredRows = useMemo(
    () => queryRows(collection.rows, globalSearch, filters, sort),
    [collection.rows, globalSearch, filters, sort]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [globalSearch, filters, pageSize]);

  const toggleSort = (field: string) => {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, direction: 'asc' };
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      return null;
    });
  };

  const addFilter = () => {
    if (draftOp !== 'is_null' && draftOp !== 'not_null' && !draftVal.trim()) return;
    setFilters((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random()}`,
        field: draftField,
        operator: draftOp,
        value: draftVal,
      },
    ]);
    setDraftVal('');
    setShowFilterBuilder(false);
  };

  const toggleColVisibility = (colName: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  };

  const toggleDateCol = (colName: string) => {
    setDateCols((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  };

  const renderSortIcon = (field: string) => {
    if (!sort || sort.field !== field || !sort.direction) {
      return <ArrowUpDown className="w-3 h-3 opacity-35 group-hover:opacity-80 transition-opacity" />;
    }
    return sort.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-500" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-500" />
    );
  };

  const renderCellValue = (val: IsarValue, prop: IsarPropertySchema & { name: string }) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 dark:text-slate-600 italic font-mono text-[11px]">null</span>;
    }

    if (prop.type === 'Bool') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
            val
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
          }`}
        >
          {String(val)}
        </span>
      );
    }

    if (val instanceof Uint8Array) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-mono text-[11px]">
          Bytes ({val.length} B)
        </span>
      );
    }

    if ((prop.type === 'Long' || prop.type === 'DateTime') && dateCols.has(prop.name) && (typeof val === 'number' || typeof val === 'bigint')) {
      return (
        <span className="font-mono text-xs text-cyan-700 dark:text-cyan-300" title={`Raw: ${val.toString()}`}>
          {formatMicrosToDate(val)}
        </span>
      );
    }

    if (typeof val === 'number' || typeof val === 'bigint') {
      return <span className="font-mono text-xs text-sky-700 dark:text-sky-300">{val.toString()}</span>;
    }

    if (Array.isArray(val)) {
      const preview = val
        .slice(0, 3)
        .map((item) => (item === null ? 'null' : typeof item === 'object' ? '{…}' : String(item)))
        .join(', ');
      return (
        <span className="inline-flex items-center gap-1.5 max-w-[260px] truncate">
          <span className="px-1.5 py-0.5 rounded bg-violet-500/12 text-violet-700 dark:text-violet-300 border border-violet-500/20 font-mono text-[10px] shrink-0">
            [{val.length}]
          </span>
          <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{preview || 'empty'}</span>
        </span>
      );
    }

    if (typeof val === 'object') {
      const entries = Object.entries(val).slice(0, 3);
      const summary = entries.map(([k, v]) => `${k}: ${v === null ? 'null' : String(v)}`).join(', ');
      return (
        <span className="inline-flex items-center gap-1 max-w-[260px] truncate px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 font-mono text-[11px] text-slate-700 dark:text-slate-300">
          {`{ ${summary} }`}
        </span>
      );
    }

    return (
      <span className="text-xs text-slate-800 dark:text-slate-200 block max-w-[280px] truncate" title={String(val)}>
        {String(val) === '' ? <span className="text-slate-400 italic">"" (empty)</span> : String(val)}
      </span>
    );
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-slate-950/90">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text && (text.includes('\n') || text.includes('\r'))) {
                  e.preventDefault();
                  const cleaned = text.replace(/[\r\n]+/g, ' ').trim();
                  setGlobalSearch(cleaned);
                }
              }}
              placeholder={`Search ${collection.schema.name} (${collection.rows.length} rows)...`}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500/60 placeholder:text-slate-400"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGlobalSearch('');
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFilterBuilder((v) => !v);
                setShowColMenu(false);
                setShowExportMenu(false);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                filters.length > 0
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
              {filters.length > 0 && (
                <span className="px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-mono">
                  {filters.length}
                </span>
              )}
            </button>

            {showFilterBuilder && (
              <div className="absolute left-0 top-full mt-1.5 w-80 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-30 space-y-2.5">
                <div className="text-xs font-semibold flex items-center justify-between">
                  <span>Add Column Filter</span>
                  <button
                    type="button"
                    onClick={() => setShowFilterBuilder(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={draftField}
                  onChange={(e) => setDraftField(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <option value="__id__">id (Id)</option>
                  {activeProps.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    value={draftOp}
                    onChange={(e) => setDraftOp(e.target.value as FilterOperator)}
                    className="w-32 px-2 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                  {draftOp !== 'is_null' && draftOp !== 'not_null' && (
                    <input
                      type="text"
                      value={draftVal}
                      onChange={(e) => setDraftVal(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addFilter()}
                      placeholder="Value..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={addFilter}
                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar */}
        <div className="flex items-center gap-2">
          {/* Columns Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowColMenu((v) => !v);
                setShowFilterBuilder(false);
                setShowExportMenu(false);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Columns</span>
            </button>

            {showColMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-72 max-h-80 overflow-y-auto p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-30 space-y-1">
                <div className="px-1.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Visibility & Format</span>
                  <button
                    type="button"
                    onClick={() => setHiddenCols(new Set())}
                    className="text-emerald-500 hover:underline normal-case font-medium cursor-pointer"
                  >
                    Show all
                  </button>
                </div>
                {activeProps.map((p) => {
                  const visible = !hiddenCols.has(p.name);
                  const canDate = p.type === 'Long' || p.type === 'DateTime';
                  const isDate = dateCols.has(p.name);
                  return (
                    <div
                      key={p.name}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70"
                    >
                      <label className="flex items-center gap-2 text-xs cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => toggleColVisibility(p.name)}
                          className="rounded accent-emerald-500"
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{p.type}</span>
                      </label>
                      {canDate && (
                        <button
                          type="button"
                          onClick={() => toggleDateCol(p.name)}
                          title="Toggle DateTime (μs) formatting"
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer ${
                            isDate
                              ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          Date
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Export */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu((v) => !v);
                setShowColMenu(false);
                setShowFilterBuilder(false);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-48 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-30">
                <button
                  type="button"
                  onClick={() => {
                    const json = JSON.stringify(
                      filteredRows.map((r) => rowToPlainJson(r, true)),
                      null,
                      2
                    );
                    downloadText(json, `${collection.schema.name}.json`, 'application/json');
                    setShowExportMenu(false);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Export JSON ({filteredRows.length} rows)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const csv = exportRowsToCsv(collection.schema, filteredRows);
                    downloadText(csv, `${collection.schema.name}.csv`, 'text/csv');
                    setShowExportMenu(false);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Export CSV ({filteredRows.length} rows)
                </button>
                {onOpenExportZip && (
                  <>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        onOpenExportZip();
                      }}
                      className="w-full px-3 py-1.5 rounded-lg text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Export All as ZIP...</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {filters.length > 0 && (
        <div className="px-4 py-1.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono"
            >
              <span>{f.field === '__id__' ? 'id' : f.field}</span>
              <span className="opacity-70">{f.operator}</span>
              {f.operator !== 'is_null' && f.operator !== 'not_null' && (
                <span className="font-semibold">"{f.value}"</span>
              )}
              <button
                type="button"
                onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}
                className="hover:text-rose-500 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setFilters([])}
            className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th
                onClick={() => toggleSort('__id__')}
                className="px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none group border-r border-slate-200/70 dark:border-slate-800/70"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">id</span>
                  <span className="text-[9px] font-mono px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    Id
                  </span>
                  {renderSortIcon('__id__')}
                </div>
              </th>

              {activeProps
                .filter((p) => !hiddenCols.has(p.name))
                .map((prop) => (
                  <th
                    key={prop.name}
                    onClick={() => toggleSort(prop.name)}
                    className="px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none group border-r border-slate-200/70 dark:border-slate-800/70"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{prop.name}</span>
                      <span className="text-[9px] font-mono px-1 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {dateCols.has(prop.name) ? 'DateTime' : prop.target ?? prop.type}
                      </span>
                      {renderSortIcon(prop.name)}
                    </div>
                  </th>
                ))}

              {collection.schema.links.map((link) => (
                <th
                  key={`link:${link.name}`}
                  onClick={() => toggleSort(`__link__:${link.name}`)}
                  className="px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none group border-r border-slate-200/70 dark:border-slate-800/70"
                >
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-cyan-500" />
                    <span>{link.name}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                      → {link.target}
                    </span>
                    {renderSortIcon(`__link__:${link.name}`)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {pagedRows.map((row) => {
              const isSelected = row.idLabel === selectedRowId;
              return (
                <tr
                  key={row.idLabel}
                  onClick={() => onSelectRow(row)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/12 dark:bg-emerald-500/15'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <td className="px-3.5 py-2 font-mono text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap border-r border-slate-100 dark:border-slate-800/50">
                    {row.idLabel}
                  </td>

                  {activeProps
                    .filter((p) => !hiddenCols.has(p.name))
                    .map((prop) => (
                      <td
                        key={prop.name}
                        className="px-3.5 py-2 whitespace-nowrap border-r border-slate-100 dark:border-slate-800/50"
                      >
                        {renderCellValue(row.fields[prop.name], prop)}
                      </td>
                    ))}

                  {collection.schema.links.map((link) => {
                    const targets = row.links[link.name] ?? [];
                    return (
                      <td
                        key={`link:${link.name}`}
                        className="px-3.5 py-2 whitespace-nowrap border-r border-slate-100 dark:border-slate-800/50"
                      >
                        {targets.length === 0 ? (
                          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-600">0</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25 font-mono text-[11px]">
                            <Link2 className="w-2.5 h-2.5" />
                            {targets.length === 1
                              ? `#${targets[0].toString()}`
                              : `${targets.length} ${link.target}`}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan={1 + activeProps.length + collection.schema.links.length}
                  className="py-16 text-center text-sm text-slate-400"
                >
                  {collection.rows.length === 0
                    ? `Collection "${collection.schema.name}" has 0 records.`
                    : 'No records match your search/filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 select-none">
        <div className="flex items-center gap-2 font-mono">
          <span>
            Showing{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filteredRows.length)}
            </strong>{' '}
            of <strong className="text-slate-800 dark:text-slate-200">{filteredRows.length}</strong>
            {filteredRows.length !== collection.rows.length && ` (filtered from ${collection.rows.length})`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs"
            >
              {[25, 50, 100, 250].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(1)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
