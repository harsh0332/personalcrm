"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  DB_COLUMNS,
  autoMapHeader,
  normalizePhone,
  detectGapReasonsSeparator,
  parseGapReasons,
  parseGapReasonsDetailed,
  parseNullableInt,
  parseNullableFloat,
  SkippedRowInfo,
  LeadInsertRecord,
} from "@/lib/import-utils";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportRecord {
  id: string;
  filename: string;
  run_id: string | null;
  total_rows: number;
  inserted: number;
  duplicates: number;
  duplicates_in_file?: number;
  skipped: number;
  imported_at: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [runIdInput, setRunIdInput] = useState<string>("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [detectedSeparator, setDetectedSeparator] = useState<"," | ";" | "|">(",");
  const [stage, setStage] = useState<"select" | "map" | "importing" | "summary">("select");
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<{
    totalRows: number;
    inserted: number;
    alreadyExisted: number;
    duplicatesInFile: number;
    skipped: number;
    skippedRows: SkippedRowInfo[];
    unrecognizedReasons?: string[];
    logWarning?: string | null;
  } | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<ImportRecord[]>([]);
  const [showSkippedDetails, setShowSkippedDetails] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const supabase = createClient();

  useEffect(() => {
    fetchRecentImports();
  }, []);

  const fetchRecentImports = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .order("imported_at", { ascending: false })
        .limit(5);

      if (!error && data) {
        setRecentImports(data as ImportRecord[]);
      }
    } catch {
      // Ignored in offline mode
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (fileToParse: File) => {
    setFile(fileToParse);
    setRunIdInput(fileToParse.name);
    setImportError(null);

    const ext = fileToParse.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(fileToParse, {
        header: true,
        skipEmptyLines: "greedy",
        encoding: "UTF-8",
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            setImportError(`CSV Parsing error: ${results.errors[0].message}`);
            return;
          }
          const headers = results.meta.fields || [];
          setupMappingStage(headers, results.data as Record<string, any>[]);
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
            defval: "",
          });

          if (jsonData.length === 0) {
            setImportError("The selected Excel file is empty.");
            return;
          }

          const headers = Object.keys(jsonData[0]);
          setupMappingStage(headers, jsonData);
        } catch (err: any) {
          setImportError(`Excel Parsing error: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(fileToParse);
    } else {
      setImportError("Unsupported file type. Please upload a .csv or .xlsx file.");
    }
  };

  const setupMappingStage = (headers: string[], rows: Record<string, any>[]) => {
    setRawHeaders(headers);
    setRawRows(rows);

    const initialMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const mapped = autoMapHeader(h);
      if (mapped) {
        initialMapping[h] = mapped;
      }
    });
    setHeaderMapping(initialMapping);

    // Detect gap_reasons separator from sample rows
    let sampleGapReasons = "";
    const gapHeader = headers.find((h) => autoMapHeader(h) === "gap_reasons");
    if (gapHeader) {
      for (const r of rows) {
        if (r[gapHeader]) {
          sampleGapReasons = String(r[gapHeader]);
          break;
        }
      }
    }
    setDetectedSeparator(detectGapReasonsSeparator(sampleGapReasons));
    setStage("map");
  };

  const handleMappingChange = (rawHeader: string, targetCol: string) => {
    setHeaderMapping((prev) => ({
      ...prev,
      [rawHeader]: targetCol,
    }));
  };

  // Required columns check: cid, name, phone
  const mappedTargets = Object.values(headerMapping);
  const isCidMapped = mappedTargets.includes("cid");
  const isNameMapped = mappedTargets.includes("name");
  const isPhoneMapped = mappedTargets.includes("phone");
  const missingRequired = [
    !isCidMapped && "cid",
    !isNameMapped && "name",
    !isPhoneMapped && "phone",
  ].filter(Boolean) as string[];

  const handleExecuteImport = async () => {
    if (missingRequired.length > 0) {
      setImportError(
        `Import blocked. Required database column(s) unmapped: ${missingRequired.join(", ")}`
      );
      return;
    }

    setStage("importing");
    setImportError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ownerId = user?.id;

    let duplicatesInFileCount = 0;
    let skippedCount = 0;
    const skippedRowsList: SkippedRowInfo[] = [];
    const validRecords: LeadInsertRecord[] = [];
    const seenCidsInFile = new Set<string>();

    // 1. Row transforms, validation, and IN-FILE DEDUPLICATION (Part A)
    const unrecognizedReasonsSet = new Set<string>();

    rawRows.forEach((row, idx) => {
      const getVal = (colKey: string) => {
        const mappedHeader = Object.keys(headerMapping).find(
          (h) => headerMapping[h] === colKey
        );
        return mappedHeader ? row[mappedHeader] : undefined;
      };

      const cidRaw = getVal("cid");
      const cid = cidRaw ? String(cidRaw).trim() : "";
      const nameRaw = getVal("name");
      const phoneRaw = getVal("phone");
      const name = nameRaw ? String(nameRaw).trim() : "";
      const { phone, phone_e164 } = normalizePhone(phoneRaw);

      if (!cid) {
        skippedCount++;
        skippedRowsList.push({
          rowIndex: idx + 1,
          dataSnippet: name || "Un-named Business",
          reason: "Missing required column: cid",
        });
        return;
      }

      if (!phone) {
        skippedCount++;
        skippedRowsList.push({
          rowIndex: idx + 1,
          dataSnippet: `${name} (CID: ${cid})`,
          reason: "Missing required column: phone",
        });
        return;
      }

      // Deduplicate within the file: keep 1st occurrence, count repeated as duplicatesInFile
      if (seenCidsInFile.has(cid)) {
        duplicatesInFileCount++;
        return;
      }
      seenCidsInFile.add(cid);

      const address = getVal("address") ? String(getVal("address")).trim() : null;
      const area = getVal("area") ? String(getVal("area")).trim() : null;
      const area_source = getVal("area_source") ? String(getVal("area_source")).trim() : null;
      const query_area = getVal("query_area") ? String(getVal("query_area")).trim() : null;
      const city = getVal("city") ? String(getVal("city")).trim() : null;
      const category = getVal("category") ? String(getVal("category")).trim() : null;
      const website = getVal("website") ? String(getVal("website")).trim() : null;
      const tier = getVal("tier") ? String(getVal("tier")).trim() : null;
      const source_run_id = runIdInput.trim() || file?.name || "import_run";

      const gap_score = parseNullableInt(getVal("gap_score"));
      const demand_score = parseNullableInt(getVal("demand_score"));
      const review_count = parseNullableInt(getVal("review_count"));
      const rating = parseNullableFloat(getVal("rating"));

      const gapParsed = parseGapReasonsDetailed(getVal("gap_reasons"));
      const gap_reasons = gapParsed.gap_reasons;
      gapParsed.unrecognized.forEach((r) => unrecognizedReasonsSet.add(r));

      validRecords.push({
        owner: ownerId,
        cid,
        name: name || "Unnamed Business",
        phone,
        phone_e164,
        address,
        area,
        area_source,
        query_area,
        city,
        category,
        website,
        gap_score,
        gap_reasons,
        demand_score,
        review_count,
        rating,
        tier,
        source_run_id,
        status: "new",
      });
    });

    // 2. Batch writing and exact insert count via ON CONFLICT DO NOTHING RETURNING select("cid") (Part B)
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);

    let totalInserted = 0;
    let totalAlreadyExisted = 0;

    for (let b = 0; b < totalBatches; b++) {
      setProgress({ current: b + 1, total: totalBatches || 1 });
      const batch = validRecords.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

      try {
        const { data: insertedRows, error: batchError } = await supabase
          .from("leads")
          .upsert(batch, { onConflict: "owner,cid", ignoreDuplicates: true })
          .select("cid");

        if (batchError) {
          setImportError(
            `Import failed at batch ${b + 1} of ${totalBatches}: ${batchError.message}. Previous batches remain saved.`
          );
          setStage("map");
          return;
        }

        const batchInserted = insertedRows ? insertedRows.length : 0;
        const batchAlreadyExisted = batch.length - batchInserted;

        totalInserted += batchInserted;
        totalAlreadyExisted += batchAlreadyExisted;
      } catch (err: any) {
        setImportError(`Import stopped at batch ${b + 1}: ${err.message}`);
        setStage("map");
        return;
      }
    }

    // 3. Write row to `imports` table and surface any failure visibly (Item 2)
    let logWarning: string | null = null;

    const importRecordPayload = {
      owner: ownerId,
      filename: file?.name || "leads.csv",
      run_id: runIdInput.trim() || file?.name || "run_1",
      total_rows: rawRows.length,
      inserted: totalInserted,
      duplicates: totalAlreadyExisted,
      duplicates_in_file: duplicatesInFileCount,
      skipped: skippedCount,
      imported_at: new Date().toISOString(),
    };

    try {
      const { error: logError } = await supabase.from("imports").insert(importRecordPayload);
      if (logError) {
        logWarning = `Warning: Leads were written to database, but recording session in 'imports' table failed: ${logError.message}`;
      }
    } catch (err: any) {
      logWarning = `Warning: Leads were written to database, but recording session in 'imports' table failed: ${err.message}`;
    }

    setImportSummary({
      totalRows: rawRows.length,
      inserted: totalInserted,
      alreadyExisted: totalAlreadyExisted,
      duplicatesInFile: duplicatesInFileCount,
      skipped: skippedCount,
      skippedRows: skippedRowsList,
      unrecognizedReasons: Array.from(unrecognizedReasonsSet),
      logWarning,
    });

    setStage("summary");
    fetchRecentImports();
  };

  const handleReset = () => {
    setFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setHeaderMapping({});
    setImportSummary(null);
    setImportError(null);
    setStage("select");
  };

  return (
    <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
      <div className="space-y-1 text-center border-b border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Import Leads</h1>
        <p className="text-xs text-zinc-400">
          Upload scraper exports (.csv or .xlsx) to populate your CRM
        </p>
      </div>

      {importError && (
        <div className="p-4 rounded-lg flex items-start space-x-3 text-sm bg-rose-950/60 border border-rose-800 text-rose-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed">{importError}</div>
        </div>
      )}

      {/* STAGE 1: FILE SELECT */}
      {stage === "select" && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-zinc-800 rounded-xl p-6 text-center hover:border-emerald-500/50 transition-colors bg-zinc-900/40">
            <input
              type="file"
              id="file-upload"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center space-y-3"
            >
              <div className="p-3 bg-zinc-800 rounded-full text-emerald-400">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <span className="text-sm font-semibold text-zinc-200 block">
                  Click to select file
                </span>
                <span className="text-xs text-zinc-500 block mt-1">
                  Supports .csv and .xlsx files
                </span>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* STAGE 2: MAPPING & PREVIEW */}
      {stage === "map" && (
        <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                {file?.name}
              </span>
              <span>{rawRows.length} total rows</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-400 block">Source Run ID</label>
              <input
                type="text"
                value={runIdInput}
                onChange={(e) => setRunIdInput(e.target.value)}
                placeholder="e.g. run_2026_08_06"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {missingRequired.length > 0 && (
            <div className="p-3 bg-amber-950/50 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Required column(s) unmapped: <strong>{missingRequired.join(", ")}</strong>
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Column Mapping
              </h2>
              <span className="text-[11px] text-zinc-500">
                Gap reasons separator: <code className="text-emerald-400 font-mono">{detectedSeparator}</code>
              </span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800/60 max-h-60 overflow-y-auto">
              {rawHeaders.map((header) => {
                const currentMapped = headerMapping[header] || "";
                return (
                  <div key={header} className="p-2.5 flex items-center justify-between text-xs">
                    <span className="truncate max-w-[140px] text-zinc-300 font-mono" title={header}>
                      {header}
                    </span>
                    <select
                      value={currentMapped}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-[170px]"
                    >
                      <option value="">-- Ignore Column --</option>
                      {DB_COLUMNS.map((col) => (
                        <option key={col.key} value={col.key}>
                          {col.label} {col.required ? "*" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FIRST 5 ROWS PREVIEW TABLE */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Parsed Data Preview (First 5 Rows)
            </h2>
            <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-900">
              <table className="w-full text-[11px] text-left text-zinc-300 whitespace-nowrap">
                <thead className="bg-zinc-950 text-zinc-400 uppercase font-mono border-b border-zinc-800">
                  <tr>
                    <th className="p-2 border-r border-zinc-800">#</th>
                    {rawHeaders.map((h) => (
                      <th key={h} className="p-2 border-r border-zinc-800">
                        {headerMapping[h] || h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {rawRows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/30">
                      <td className="p-2 border-r border-zinc-800 font-mono text-zinc-500">
                        {idx + 1}
                      </td>
                      {rawHeaders.map((h) => (
                        <td key={h} className="p-2 border-r border-zinc-800 max-w-[150px] truncate">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteImport}
              disabled={missingRequired.length > 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold"
            >
              Confirm & Import
            </Button>
          </div>
        </div>
      )}

      {/* STAGE 3: IMPORTING PROGRESS */}
      {stage === "importing" && (
        <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-200">Writing to Database...</h3>
            <p className="text-xs text-zinc-400">
              Processing batch {progress.current} of {progress.total}
            </p>
          </div>
          <div className="w-full max-w-xs bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{
                width: `${(progress.current / (progress.total || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* STAGE 4: RECONCILED SUMMARY OUTPUT */}
      {stage === "summary" && importSummary && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="text-sm font-bold text-zinc-100">Import Session Complete</h2>
            </div>

            {importSummary.logWarning && (
              <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="leading-relaxed">{importSummary.logWarning}</span>
              </div>
            )}

            {importSummary.unrecognizedReasons && importSummary.unrecognizedReasons.length > 0 && (
              <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-300 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    {importSummary.unrecognizedReasons.length} unrecognized gap reason(s) detected:
                  </div>
                  <div className="font-mono text-[11px] text-amber-200">
                    {importSummary.unrecognizedReasons.join(", ")}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-medium">Total File Rows</span>
                <span className="text-lg font-bold text-zinc-100 font-mono">{importSummary.totalRows}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-emerald-950/40 rounded-lg border border-emerald-800/60">
                  <span className="text-[10px] text-emerald-400 uppercase font-semibold block">
                    Inserted New
                  </span>
                  <span className="text-base font-bold text-emerald-300 font-mono">
                    {importSummary.inserted}
                  </span>
                </div>
                <div className="p-2.5 bg-amber-950/40 rounded-lg border border-amber-800/60">
                  <span className="text-[10px] text-amber-400 uppercase font-semibold block">
                    Already Existed
                  </span>
                  <span className="text-base font-bold text-amber-300 font-mono">
                    {importSummary.alreadyExisted}
                  </span>
                </div>
                <div className="p-2.5 bg-purple-950/40 rounded-lg border border-purple-800/60">
                  <span className="text-[10px] text-purple-400 uppercase font-semibold block">
                    Duplicates in File
                  </span>
                  <span className="text-base font-bold text-purple-300 font-mono">
                    {importSummary.duplicatesInFile}
                  </span>
                </div>
                <div className="p-2.5 bg-rose-950/40 rounded-lg border border-rose-800/60">
                  <span className="text-[10px] text-rose-400 uppercase font-semibold block">
                    Invalid / Skipped
                  </span>
                  <span className="text-base font-bold text-rose-300 font-mono">
                    {importSummary.skipped}
                  </span>
                </div>
              </div>
            </div>

            {/* RECONCILIATION ARITHMETIC PROOF */}
            <div className="text-xs text-center text-zinc-300 pt-3 border-t border-zinc-800/60 font-mono bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-sans">
                Reconciliation Arithmetic Proof
              </div>
              <div>
                {importSummary.inserted} (inserted) + {importSummary.alreadyExisted} (already existed) +{" "}
                {importSummary.duplicatesInFile} (in-file dupes) + {importSummary.skipped} (skipped)
              </div>
              <div className="text-emerald-400 font-bold mt-1">
                = {importSummary.inserted + importSummary.alreadyExisted + importSummary.duplicatesInFile + importSummary.skipped}{" "}
                (Matches Total File Rows: {importSummary.totalRows})
              </div>
            </div>

            {importSummary.skipped > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                  className="w-full flex items-center justify-between text-xs text-rose-400 hover:text-rose-300 py-1 font-medium"
                >
                  <span>View Skipped Rows ({importSummary.skipped})</span>
                  {showSkippedDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showSkippedDetails && (
                  <div className="mt-2 p-2 bg-zinc-950 border border-zinc-800 rounded-lg max-h-40 overflow-y-auto divide-y divide-zinc-900 text-[11px]">
                    {importSummary.skippedRows.map((sr, idx) => (
                      <div key={idx} className="py-1 flex justify-between gap-2">
                        <span className="text-zinc-400 font-mono">Row {sr.rowIndex}</span>
                        <span className="text-zinc-200 truncate">{sr.dataSnippet}</span>
                        <span className="text-rose-400">{sr.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            onClick={handleReset}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
          >
            Import Another File
          </Button>
        </div>
      )}

      {/* RECENT IMPORTS HISTORY */}
      <div className="space-y-3 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Recent Imports (Last 5)
          </h2>
          <button
            onClick={fetchRecentImports}
            className="text-zinc-500 hover:text-zinc-300 p-1"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-900">
          <table className="w-full text-[11px] text-left whitespace-nowrap text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
              <tr>
                <th className="p-2 border-r border-zinc-800">File</th>
                <th className="p-2 border-r border-zinc-800">Run ID</th>
                <th className="p-2 border-r border-zinc-800">Total</th>
                <th className="p-2 border-r border-zinc-800 text-emerald-400">Inserted</th>
                <th className="p-2 border-r border-zinc-800 text-amber-400">Already Existed</th>
                <th className="p-2 border-r border-zinc-800 text-purple-400">File Dupes</th>
                <th className="p-2 text-rose-400">Skipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {recentImports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-zinc-500 text-xs">
                    No recent import history recorded.
                  </td>
                </tr>
              ) : (
                recentImports.map((imp) => (
                  <tr key={imp.id} className="hover:bg-zinc-800/30 font-mono">
                    <td className="p-2 border-r border-zinc-800 text-zinc-200 font-sans max-w-[100px] truncate">
                      {imp.filename}
                    </td>
                    <td className="p-2 border-r border-zinc-800 text-zinc-400 max-w-[80px] truncate">
                      {imp.run_id || "-"}
                    </td>
                    <td className="p-2 border-r border-zinc-800 text-zinc-300">
                      {imp.total_rows}
                    </td>
                    <td className="p-2 border-r border-zinc-800 text-emerald-300 font-bold">
                      {imp.inserted}
                    </td>
                    <td className="p-2 border-r border-zinc-800 text-amber-300">
                      {imp.duplicates}
                    </td>
                    <td className="p-2 border-r border-zinc-800 text-purple-300">
                      {imp.duplicates_in_file ?? 0}
                    </td>
                    <td className="p-2 text-rose-300">{imp.skipped}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
