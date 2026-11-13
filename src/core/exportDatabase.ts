import { zip, zipSync, strToU8, Zippable, AsyncZippable } from 'fflate';
import { IsarDatabaseModel, rowToPlainJson } from './isarDatabase';

export interface ExportZipOptions {
  /** Include link relation lists in JSON as `@link:<name>` (default: true) */
  includeLinks?: boolean;
  /** Pretty-format JSON with 2-space indentation (default: true) */
  pretty?: boolean;
  /** Subset of collection names to export (default: all collections) */
  selectedCollections?: string[];
  /** Include a `_schema.json` metadata summary file (default: true) */
  includeSchema?: boolean;
  /** Custom output ZIP filename */
  filename?: string;
}

export interface ExportProgress {
  phase: 'preparing' | 'serializing' | 'compressing' | 'done';
  collectionName?: string;
  processedCollections: number;
  totalCollections: number;
  processedRows: number;
  totalRows: number;
  percent: number;
}

export interface ExportZipResult {
  blob: Blob;
  filename: string;
  filesCount: number;
  totalRows: number;
  byteSize: number;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
}

/**
 * Converts all or selected collections from an Isar database into JSON files
 * and packages them into a compressed ZIP file.
 */
export async function exportDatabaseToJsonZip(
  db: IsarDatabaseModel,
  options: ExportZipOptions = {},
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportZipResult> {
  const includeLinks = options.includeLinks ?? true;
  const pretty = options.pretty ?? true;
  const includeSchema = options.includeSchema ?? true;

  const targetCollections = options.selectedCollections
    ? db.collections.filter((c) => options.selectedCollections!.includes(c.schema.name))
    : db.collections;

  const totalCollections = targetCollections.length;
  const totalRows = targetCollections.reduce((sum, c) => sum + c.rows.length, 0);

  onProgress?.({
    phase: 'preparing',
    processedCollections: 0,
    totalCollections,
    processedRows: 0,
    totalRows,
    percent: 0,
  });

  const zipFiles: Zippable = {};
  let processedRows = 0;

  for (let i = 0; i < totalCollections; i++) {
    const col = targetCollections[i];
    onProgress?.({
      phase: 'serializing',
      collectionName: col.schema.name,
      processedCollections: i,
      totalCollections,
      processedRows,
      totalRows,
      percent: Math.round((processedRows / Math.max(1, totalRows)) * 80),
    });

    // Yield to the event loop so progress state can render smoothly
    await new Promise((resolve) => setTimeout(resolve, 0));

    const plainRows = col.rows.map((r) => rowToPlainJson(r, includeLinks));
    const jsonString = JSON.stringify(plainRows, null, pretty ? 2 : undefined);
    const fileName = `${sanitizeFileName(col.schema.name)}.json`;

    zipFiles[fileName] = strToU8(jsonString);
    processedRows += col.rows.length;
  }

  // Include _schema.json if requested
  if (includeSchema) {
    const schemaMeta = {
      databaseName: db.fileName,
      exportedAt: new Date().toISOString(),
      totalCollections: targetCollections.length,
      totalRows,
      collections: targetCollections.map((c) => ({
        name: c.schema.name,
        embedded: c.schema.embedded,
        rowCount: c.rows.length,
        properties: c.schema.properties,
        indexes: c.schema.indexes,
        links: c.schema.links,
      })),
      embeddedSchemas: db.embeddedSchemas,
    };
    zipFiles['_schema.json'] = strToU8(JSON.stringify(schemaMeta, null, pretty ? 2 : undefined));
  }

  onProgress?.({
    phase: 'compressing',
    processedCollections: totalCollections,
    totalCollections,
    processedRows: totalRows,
    totalRows,
    percent: 85,
  });

  // Yield to UI before compression
  await new Promise((resolve) => setTimeout(resolve, 0));

  const zipData = await new Promise<Uint8Array>((resolve, reject) => {
    // If running in browser with fflate async zip
    try {
      zip(zipFiles as AsyncZippable, { level: 6 }, (err, data) => {
        if (err) {
          // Fallback to zipSync if callback throws
          try {
            resolve(zipSync(zipFiles, { level: 6 }));
          } catch (syncErr) {
            reject(err);
          }
        } else {
          resolve(data);
        }
      });
    } catch {
      try {
        resolve(zipSync(zipFiles, { level: 6 }));
      } catch (syncErr) {
        reject(syncErr);
      }
    }
  });

  const baseName = db.fileName.replace(/\.isar$/i, '') || 'isar_database';
  const outFilename = options.filename?.trim()
    ? (options.filename.endsWith('.zip') ? options.filename : `${options.filename}.zip`)
    : `${baseName}-export.zip`;

  const blob = new Blob([zipData as unknown as BlobPart], { type: 'application/zip' });

  onProgress?.({
    phase: 'done',
    processedCollections: totalCollections,
    totalCollections,
    processedRows: totalRows,
    totalRows,
    percent: 100,
  });

  return {
    blob,
    filename: outFilename,
    filesCount: Object.keys(zipFiles).length,
    totalRows,
    byteSize: zipData.byteLength,
  };
}

/**
 * Triggers a browser download of a generated Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
