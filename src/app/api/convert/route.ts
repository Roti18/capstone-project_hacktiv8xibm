import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

// File size limit (20MB for most formats)
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Supported conversions mapping
const SUPPORTED_CONVERSIONS: { [key: string]: string[] } = {
  // PDF conversions
  "application/pdf": ["docx", "txt", "html", "jpg", "png", "xlsx", "pptx"],
  pdf: ["docx", "txt", "html", "jpg", "png", "xlsx", "pptx"],

  // Document conversions
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "pdf",
    "txt",
    "html",
    "docx",
    "rtf",
  ],
  docx: ["pdf", "txt", "html", "docx", "rtf"],
  "application/msword": ["pdf", "docx", "txt", "html"],
  doc: ["pdf", "docx", "txt", "html"],

  // Text conversions
  "text/plain": ["pdf", "docx", "html", "rtf"],
  txt: ["pdf", "docx", "html", "rtf"],

  // HTML conversions
  "text/html": ["pdf", "docx", "txt"],
  html: ["pdf", "docx", "txt"],

  // Excel conversions
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    "pdf",
    "csv",
    "xlsx",
    "html",
  ],
  xlsx: ["pdf", "csv", "xlsx", "html"],
  "application/vnd.ms-excel": ["pdf", "csv", "xlsx", "html"],
  xls: ["pdf", "csv", "xlsx", "html"],

  // PowerPoint conversions
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "pdf",
    "pptx",
    "jpg",
    "png",
  ],
  pptx: ["pdf", "pptx", "jpg", "png"],
  "application/vnd.ms-powerpoint": ["pdf", "pptx", "jpg", "png"],
  ppt: ["pdf", "pptx", "jpg", "png"],

  // Image conversions
  "image/jpeg": ["pdf", "png", "jpg", "gif", "webp"],
  jpg: ["pdf", "png", "jpg", "gif", "webp"],
  jpeg: ["pdf", "png", "jpg", "gif", "webp"],
  "image/png": ["pdf", "jpg", "png", "gif", "webp"],
  png: ["pdf", "jpg", "png", "gif", "webp"],

  // CSV conversions
  "text/csv": ["xlsx", "pdf", "html"],
  csv: ["xlsx", "pdf", "html"],
};

// MIME type mapping
const MIME_TYPES: { [key: string]: string } = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  html: "text/html",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  csv: "text/csv",
  rtf: "application/rtf",
};

// Get file extension from MIME type or filename
function getFileExtension(file: File): string {
  if (file.name.includes(".")) {
    return file.name.split(".").pop()?.toLowerCase() || "";
  }

  // Fallback to MIME type mapping
  const mimeToExt: { [key: string]: string } = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/html": "html",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/jpeg": "jpg",
    "image/png": "png",
    "text/csv": "csv",
  };

  return mimeToExt[file.type] || "";
}

// Check if conversion is supported
function isConversionSupported(fromFormat: string, toFormat: string): boolean {
  const supportedFormats =
    SUPPORTED_CONVERSIONS[fromFormat] ||
    SUPPORTED_CONVERSIONS[fromFormat.toLowerCase()];
  return supportedFormats
    ? supportedFormats.includes(toFormat.toLowerCase())
    : false;
}

export async function POST(req: Request) {
  let filePath: string | null = null;

  try {
    // Check ConvertAPI key
    const apiKey = process.env.CONVERTAPI_SECRET;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "ConvertAPI key diperlukan",
          setup: {
            step1: "Daftar gratis di https://www.convertapi.com/",
            step2: "Dapatkan Secret Key dari dashboard",
            step3: "Tambahkan ke .env.local: CONVERTAPI_SECRET=your_secret_key",
            step4: "Restart development server",
            freeQuota: "250 conversions per month",
          },
        },
        { status: 400 }
      );
    }

    console.log("🔑 ConvertAPI key found");

    // Parse form data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const targetFormat = form.get("format") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "File tidak ditemukan dalam form data" },
        { status: 400 }
      );
    }

    if (!targetFormat) {
      return NextResponse.json(
        { error: "Target format tidak ditentukan. Gunakan parameter 'format'" },
        { status: 400 }
      );
    }

    const sourceFormat = getFileExtension(file);
    const targetFormatLower = targetFormat.toLowerCase();

    console.log("📎 Conversion request:", {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      sourceFormat,
      targetFormat: targetFormatLower,
    });

    // Validate source format
    if (!sourceFormat) {
      return NextResponse.json(
        {
          error: "Format file tidak dapat dideteksi",
          supportedFormats: Object.keys(SUPPORTED_CONVERSIONS)
            .filter((k) => !k.includes("/"))
            .join(", "),
        },
        { status: 400 }
      );
    }

    // Check if conversion is supported
    if (
      !isConversionSupported(sourceFormat, targetFormatLower) &&
      !isConversionSupported(file.type, targetFormatLower)
    ) {
      const supportedTargets =
        SUPPORTED_CONVERSIONS[sourceFormat] ||
        SUPPORTED_CONVERSIONS[file.type] ||
        [];

      return NextResponse.json(
        {
          error: `Konversi dari ${sourceFormat.toUpperCase()} ke ${targetFormatLower.toUpperCase()} tidak didukung`,
          sourceFormat: sourceFormat.toUpperCase(),
          targetFormat: targetFormatLower.toUpperCase(),
          supportedTargetFormats: supportedTargets,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File terlalu besar. Maksimal ${
            MAX_FILE_SIZE / 1024 / 1024
          }MB`,
          fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "File kosong atau corrupt" },
        { status: 400 }
      );
    }

    // Create temp directory
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log("📁 Created temp directory");
    }

    // Save file temporarily
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    filePath = path.join(tempDir, `input_${timestamp}_${sanitizedFileName}`);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      console.log("📁 File saved:", filePath);

      // Verify file was written correctly
      if (
        !fs.existsSync(filePath) ||
        fs.statSync(filePath).size !== buffer.length
      ) {
        throw new Error("File verification failed after write");
      }
    } catch (fileError) {
      console.error("❌ Failed to save file:", fileError);
      return NextResponse.json(
        { error: "Gagal menyimpan file sementara" },
        { status: 500 }
      );
    }

    // Convert with ConvertAPI
    console.log(
      `🔄 Converting ${sourceFormat.toUpperCase()} to ${targetFormatLower.toUpperCase()}...`
    );

    const convertForm = new FormData();
    convertForm.append("File", fs.createReadStream(filePath));

    // Build ConvertAPI URL
    const apiUrl = `https://v2.convertapi.com/convert/${sourceFormat}/to/${targetFormatLower}?Secret=${apiKey}`;

    let convertResponse;
    try {
      convertResponse = await axios.post(apiUrl, convertForm, {
        headers: {
          ...convertForm.getHeaders(),
          "User-Agent": "Universal File Converter",
        },
        timeout: 180000, // 3 minutes timeout for complex conversions
        maxRedirects: 5,
      });
    } catch (axiosError: any) {
      console.error("❌ ConvertAPI request failed:", {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        url: apiUrl,
      });

      // Handle specific errors
      if (axiosError.response?.status === 401) {
        return NextResponse.json(
          { error: "ConvertAPI key tidak valid" },
          { status: 401 }
        );
      } else if (axiosError.response?.status === 402) {
        return NextResponse.json(
          {
            error:
              "Quota ConvertAPI habis. Upgrade plan atau tunggu bulan depan.",
          },
          { status: 402 }
        );
      } else if (axiosError.response?.status === 422) {
        return NextResponse.json(
          {
            error: `File ${sourceFormat.toUpperCase()} tidak valid atau corrupt`,
          },
          { status: 422 }
        );
      } else if (axiosError.response?.status === 400) {
        return NextResponse.json(
          {
            error: `Konversi ${sourceFormat.toUpperCase()} ke ${targetFormatLower.toUpperCase()} tidak didukung oleh ConvertAPI`,
            details: axiosError.response?.data,
          },
          { status: 400 }
        );
      }

      throw axiosError;
    }

    console.log("📊 ConvertAPI response:", {
      status: convertResponse.status,
      filesCount: convertResponse.data?.Files?.length,
      conversionTime: convertResponse.data?.ConversionTime,
    });

    // Extract file data
    const responseData = convertResponse.data;
    const fileInfo = responseData?.Files?.[0];

    if (!fileInfo) {
      console.error("❌ No file info found:", responseData);
      return NextResponse.json(
        { error: "ConvertAPI tidak mengembalikan file hasil konversi" },
        { status: 500 }
      );
    }

    let convertedBuffer: Buffer;

    // Handle both FileData and Url responses
    if (fileInfo.FileData) {
      console.log(
        "📦 File returned as base64 data, size:",
        fileInfo.FileSize,
        "bytes"
      );

      try {
        convertedBuffer = Buffer.from(fileInfo.FileData, "base64");
        console.log(
          "✅ Decoded base64 data, buffer size:",
          convertedBuffer.length,
          "bytes"
        );
      } catch (decodeError) {
        console.error("❌ Failed to decode base64 file data:", decodeError);
        throw new Error("Gagal mendecode file hasil konversi");
      }
    } else if (fileInfo.Url) {
      console.log("⬇️ Downloading from URL:", fileInfo.Url);

      const downloadResponse = await axios.get(fileInfo.Url, {
        responseType: "arraybuffer",
        timeout: 60000,
        headers: { "User-Agent": "Universal File Converter" },
      });

      if (downloadResponse.status !== 200) {
        throw new Error(
          `Download failed with status: ${downloadResponse.status}`
        );
      }

      convertedBuffer = Buffer.from(downloadResponse.data);
    } else {
      return NextResponse.json(
        { error: "ConvertAPI response tidak mengandung FileData atau Url" },
        { status: 500 }
      );
    }

    if (convertedBuffer.length === 0) {
      throw new Error("Converted file is empty");
    }

    console.log("✅ Conversion successful!", {
      inputFormat: sourceFormat.toUpperCase(),
      outputFormat: targetFormatLower.toUpperCase(),
      inputSize: file.size,
      outputSize: convertedBuffer.length,
      fileName: fileInfo.FileName,
      conversionTime: convertResponse.data?.ConversionTime,
    });

    // Generate output filename
    const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove original extension
    const outputFileName = `${baseName}.${targetFormatLower}`;
    const contentType =
      MIME_TYPES[targetFormatLower] || "application/octet-stream";

    // Return converted file
    return new Response(convertedBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${outputFileName}"`,
        "Content-Length": convertedBuffer.length.toString(),
        "X-Conversion-Time": convertResponse.data?.ConversionTime || "unknown",
        "X-Original-Format": sourceFormat.toUpperCase(),
        "X-Target-Format": targetFormatLower.toUpperCase(),
        "X-Original-Size": file.size.toString(),
        "X-Converted-Size": convertedBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("❌ Conversion error:", {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
    });

    let errorMessage = "Conversion failed: " + err.message;
    let statusCode = 500;

    if (err.response?.status === 401) {
      errorMessage = "ConvertAPI key tidak valid";
      statusCode = 401;
    } else if (err.response?.status === 402) {
      errorMessage = "ConvertAPI quota exceeded";
      statusCode = 402;
    } else if (err.code === "ECONNABORTED") {
      errorMessage =
        "Conversion timeout. File mungkin terlalu besar atau kompleks.";
      statusCode = 408;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        timestamp: new Date().toISOString(),
        helpUrl: "https://www.convertapi.com/doc",
      },
      { status: statusCode }
    );
  } finally {
    // Always cleanup temp file
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("🗑️ Temp file cleaned up");
      } catch (cleanupErr) {
        console.error("⚠️ Failed to cleanup temp file:", cleanupErr);
      }
    }
  }
}

// GET endpoint to show supported conversions
export async function GET() {
  return NextResponse.json({
    message: "Universal File Converter API",
    usage: {
      endpoint: "POST /api/convert",
      parameters: {
        file: "File to convert (multipart/form-data)",
        format: "Target format (e.g., 'docx', 'pdf', 'txt')",
      },
      example:
        "curl -X POST -F 'file=@document.pdf' -F 'format=docx' /api/convert",
    },
    supportedConversions: Object.fromEntries(
      Object.entries(SUPPORTED_CONVERSIONS)
        .filter(([key]) => !key.includes("/"))
        .map(([key, value]) => [
          key.toUpperCase(),
          value.map((v) => v.toUpperCase()),
        ])
    ),
    limits: {
      maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
      timeout: "3 minutes",
      monthlyQuota: "250 conversions (free tier)",
    },
  });
}
