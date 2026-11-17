import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Clock } from 'lucide-react';
import { CollectionData, DecodedRow, formatMicrosToDate, isLikelyMicrosTimestamp } from '../core/isarDatabase';
import { IsarPropertyType, IsarRecord, IsarValue } from '../core/isarDecoder';

interface EditRecordModalProps {
  isOpen: boolean;
  collection: CollectionData;
  row: DecodedRow;
  onClose: () => void;
  onSave: (modifiedFields: IsarRecord) => void;
}

export const EditRecordModal: React.FC<EditRecordModalProps> = ({
  isOpen,
  collection,
  row,
  onClose,
  onSave,
}) => {
  const [fields, setFields] = useState<IsarRecord>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && row) {
      // Clone row fields
      setFields(JSON.parse(JSON.stringify(row.fields)));
      setJsonErrors({});
    }
  }, [isOpen, row]);

  if (!isOpen) return null;

  const handleFieldChange = (propName: string, value: IsarValue) => {
    setFields((prev) => ({ ...prev, [propName]: value }));
  };

  const handleJsonFieldChange = (propName: string, text: string) => {
    try {
      if (text.trim() === '' || text.trim() === 'null') {
        setFields((prev) => ({ ...prev, [propName]: null }));
        setJsonErrors((prev) => {
          const next = { ...prev };
          delete next[propName];
          return next;
        });
        return;
      }
      const parsed = JSON.parse(text);
      setFields((prev) => ({ ...prev, [propName]: parsed }));
      setJsonErrors((prev) => {
        const next = { ...prev };
        delete next[propName];
        return next;
      });
    } catch (err) {
      setJsonErrors((prev) => ({
        ...prev,
        [propName]: err instanceof Error ? err.message : 'Invalid JSON',
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(jsonErrors).length > 0) return;
    onSave(fields);
    onClose();
  };

  const renderInputForProp = (propName: string, type: IsarPropertyType) => {
    const val = fields[propName];
    const isNull = val === null || val === undefined;

    switch (type) {
      case 'Bool': {
        return (
          <select
            value={val === null || val === undefined ? 'null' : String(val)}
            onChange={(e) => {
              const v = e.target.value;
              handleFieldChange(propName, v === 'null' ? null : v === 'true');
            }}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
          >
            <option value="null">null</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        );
      }
      case 'Byte':
      case 'Int': {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min={type === 'Byte' ? 0 : undefined}
              max={type === 'Byte' ? 255 : undefined}
              value={isNull ? '' : Number(val)}
              disabled={isNull}
              placeholder="null"
              onChange={(e) => {
                const num = e.target.value === '' ? null : parseInt(e.target.value, 10);
                handleFieldChange(propName, num);
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNull}
                onChange={(e) => handleFieldChange(propName, e.target.checked ? null : 0)}
                className="rounded border-slate-300"
              />
              <span>Null</span>
            </label>
          </div>
        );
      }
      case 'Long': {
        return (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={isNull ? '' : String(val)}
              disabled={isNull}
              placeholder="null"
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === '') {
                  handleFieldChange(propName, null);
                } else {
                  try {
                    handleFieldChange(propName, BigInt(raw));
                  } catch {
                    // Keep text or number
                    handleFieldChange(propName, Number(raw) || 0);
                  }
                }
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNull}
                onChange={(e) => handleFieldChange(propName, e.target.checked ? null : 0)}
                className="rounded border-slate-300"
              />
              <span>Null</span>
            </label>
          </div>
        );
      }
      case 'Float':
      case 'Double': {
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={isNull ? '' : Number(val)}
              disabled={isNull}
              placeholder="null"
              onChange={(e) => {
                const num = e.target.value === '' ? null : parseFloat(e.target.value);
                handleFieldChange(propName, num);
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNull}
                onChange={(e) => handleFieldChange(propName, e.target.checked ? null : 0.0)}
                className="rounded border-slate-300"
              />
              <span>Null</span>
            </label>
          </div>
        );
      }
      case 'DateTime': {
        const micros = typeof val === 'number' || typeof val === 'bigint' ? val : null;
        const isoString = micros ? new Date(Number(BigInt(micros) / 1000n)).toISOString().slice(0, 16) : '';

        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={isoString}
                disabled={isNull}
                onChange={(e) => {
                  if (!e.target.value) {
                    handleFieldChange(propName, null);
                  } else {
                    const ms = new Date(e.target.value).getTime();
                    handleFieldChange(propName, BigInt(ms) * 1000n);
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleFieldChange(propName, BigInt(Date.now()) * 1000n)}
                className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-mono shrink-0 cursor-pointer"
              >
                Now
              </button>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isNull}
                  onChange={(e) => handleFieldChange(propName, e.target.checked ? null : BigInt(Date.now()) * 1000n)}
                  className="rounded border-slate-300"
                />
                <span>Null</span>
              </label>
            </div>
            {!isNull && micros !== null && isLikelyMicrosTimestamp(micros) && (
              <p className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatMicrosToDate(micros)}</span>
              </p>
            )}
          </div>
        );
      }
      case 'String': {
        const isLong = typeof val === 'string' && (val.length > 60 || val.includes('\n'));
        return (
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              {isLong ? (
                <textarea
                  rows={3}
                  value={isNull ? '' : String(val)}
                  disabled={isNull}
                  placeholder="null"
                  onChange={(e) => handleFieldChange(propName, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
                />
              ) : (
                <input
                  type="text"
                  value={isNull ? '' : String(val)}
                  disabled={isNull}
                  placeholder="null"
                  onChange={(e) => handleFieldChange(propName, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono disabled:opacity-50"
                />
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none mt-1.5">
                <input
                  type="checkbox"
                  checked={isNull}
                  onChange={(e) => handleFieldChange(propName, e.target.checked ? null : '')}
                  className="rounded border-slate-300"
                />
                <span>Null</span>
              </label>
            </div>
          </div>
        );
      }
      case 'Object':
      case 'BoolList':
      case 'ByteList':
      case 'IntList':
      case 'FloatList':
      case 'LongList':
      case 'DateTimeList':
      case 'DoubleList':
      case 'StringList':
      case 'ObjectList': {
        const jsonText = isNull ? '' : JSON.stringify(val, null, 2);
        const hasErr = jsonErrors[propName];

        return (
          <div className="space-y-1">
            <textarea
              rows={4}
              defaultValue={jsonText}
              placeholder="null or JSON array/object"
              onChange={(e) => handleJsonFieldChange(propName, e.target.value)}
              className={`w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border font-mono text-xs ${
                hasErr
                  ? 'border-rose-500 dark:border-rose-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            />
            {hasErr && (
              <p className="text-[11px] text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{hasErr}</span>
              </p>
            )}
          </div>
        );
      }
      default:
        return (
          <input
            type="text"
            value={isNull ? '' : String(val)}
            onChange={(e) => handleFieldChange(propName, e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
          />
        );
    }
  };

  const hasErrors = Object.keys(jsonErrors).length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">Edit Record</h2>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-semibold">
              {collection.schema.name} #{row.idLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields list */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Read-only ID */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">id</label>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                Id (Primary Key)
              </span>
            </div>
            <input
              type="text"
              readOnly
              value={row.idLabel}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-400 cursor-not-allowed"
            />
          </div>

          {collection.schema.properties.map((prop) => {
            if (!prop.name) return null;
            return (
              <div key={prop.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
                      {prop.name}
                    </label>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {prop.type}
                      {prop.target ? `<${prop.target}>` : ''}
                    </span>
                  </div>
                </div>
                {renderInputForProp(prop.name, prop.type)}
              </div>
            );
          })}

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={hasErrors}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Apply Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
