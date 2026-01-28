"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "components/ui/button";
import { Card, CardContent } from "components/ui/card";
import { Progress } from "components/ui/progress";
import { Icons } from "@/custom-components/icons";
import { cn } from "components/lib/utils";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

interface FileWithPreview extends File {
  preview: string;
  id: string;
}

interface UploadProgress {
  [key: string]: {
    progress: number;
    status: "pending" | "uploading" | "completed" | "error";
    error?: string;
    receiptId?: string;
  };
}

interface ReceiptUploaderProps {
  orgId: string;
  orgName: string;
}

export function ReceiptUploader({ orgId, orgName }: ReceiptUploaderProps) {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});
  const [isUploading, setIsUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) =>
      Object.assign(file, {
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
        id: crypto.randomUUID(),
      })
    );
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    onDropRejected: (rejectedFiles) => {
      rejectedFiles.forEach((rejection) => {
        const errors = rejection.errors.map((e) => e.message).join(", ");
        console.error(`File rejected: ${rejection.file.name} - ${errors}`);
      });
    },
  });

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const capturedFiles = e.target.files;
    if (capturedFiles) {
      onDrop(Array.from(capturedFiles));
    }
    // Reset input to allow capturing same image again
    e.target.value = "";
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== fileId);
    });
    setUploadProgress((prev) => {
      const { [fileId]: removed, ...rest } = prev;
      return rest;
    });
  };

  const uploadFile = async (file: FileWithPreview): Promise<string | null> => {
    setUploadProgress((prev) => ({
      ...prev,
      [file.id]: { progress: 0, status: "uploading" },
    }));

    try {
      // Get presigned URL for upload
      const presignResponse = await fetch(
        `/api/orgs/${orgName}/receipts/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        }
      );

      if (!presignResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, receiptId } = (await presignResponse.json()) as {
        uploadUrl: string;
        receiptId: string;
      };

      // Upload to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      setUploadProgress((prev) => ({
        ...prev,
        [file.id]: { progress: 100, status: "completed", receiptId },
      }));

      return receiptId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setUploadProgress((prev) => ({
        ...prev,
        [file.id]: { progress: 0, status: "error", error: errorMessage },
      }));
      return null;
    }
  };

  const handleUploadAll = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const receiptIds: string[] = [];

    // Upload files sequentially for better UX feedback
    for (const file of files) {
      const existingStatus = uploadProgress[file.id];
      if (existingStatus?.status === "completed") {
        if (existingStatus.receiptId) {
          receiptIds.push(existingStatus.receiptId);
        }
        continue;
      }

      const receiptId = await uploadFile(file);
      if (receiptId) {
        receiptIds.push(receiptId);
      }
    }

    setIsUploading(false);

    // If all uploads succeeded, redirect to review page
    const allSucceeded = Object.values(uploadProgress).every(
      (p) => p.status === "completed"
    );
    if (allSucceeded && receiptIds.length > 0) {
      router.push(`/${orgName}/receipts/review?ids=${receiptIds.join(",")}`);
    }
  };

  const completedCount = Object.values(uploadProgress).filter(
    (p) => p.status === "completed"
  ).length;
  const errorCount = Object.values(uploadProgress).filter(
    (p) => p.status === "error"
  ).length;

  return (
    <div className="space-y-6">
      {/* Drag and drop zone */}
      <Card>
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            className={cn(
              "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Icons.upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragActive
                    ? "Drop files here..."
                    : "Drag and drop receipts here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse. Supports JPG, PNG, WebP, PDF (max 10MB)
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Camera capture button - prominent on mobile */}
      <div className="flex justify-center md:hidden">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleCameraCapture}
          className="w-full"
        >
          <Icons.camera className="mr-2 h-5 w-5" />
          Take Photo
        </Button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraInput}
          className="hidden"
        />
      </div>

      {/* Desktop camera button */}
      <div className="hidden md:flex md:justify-start">
        <Button type="button" variant="outline" onClick={handleCameraCapture}>
          <Icons.camera className="mr-2 h-4 w-4" />
          Camera
        </Button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraInput}
          className="hidden"
        />
      </div>

      {/* Preview thumbnails */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </h3>
              {completedCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {completedCount} uploaded
                  {errorCount > 0 && `, ${errorCount} failed`}
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {files.map((file) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  progress={uploadProgress[file.id]}
                  onRemove={() => removeFile(file.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload button */}
      {files.length > 0 && (
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              files.forEach((f) => {
                if (f.preview) URL.revokeObjectURL(f.preview);
              });
              setFiles([]);
              setUploadProgress({});
            }}
            disabled={isUploading}
          >
            Clear All
          </Button>
          <Button
            type="button"
            onClick={handleUploadAll}
            disabled={isUploading || files.length === 0}
            loading={isUploading}
          >
            {isUploading
              ? "Uploading..."
              : `Upload ${files.length} Receipt${
                  files.length !== 1 ? "s" : ""
                }`}
          </Button>
        </div>
      )}
    </div>
  );
}

interface FilePreviewProps {
  file: FileWithPreview;
  progress?: UploadProgress[string];
  onRemove: () => void;
}

function FilePreview({ file, progress, onRemove }: FilePreviewProps) {
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-background">
      {/* Preview image/placeholder */}
      <div className="relative aspect-[3/4] bg-muted">
        {isImage && file.preview ? (
          <img
            src={file.preview}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            {isPdf ? (
              <Icons.page className="h-12 w-12 text-muted-foreground" />
            ) : (
              <Icons.media className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Status overlay */}
        {progress && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-background/80",
              progress.status === "completed" && "bg-green-500/20",
              progress.status === "error" && "bg-destructive/20"
            )}
          >
            {progress.status === "uploading" && (
              <Icons.spinner className="h-8 w-8 animate-spin text-primary" />
            )}
            {progress.status === "completed" && (
              <Icons.check className="h-8 w-8 text-green-600" />
            )}
            {progress.status === "error" && (
              <Icons.warning className="h-8 w-8 text-destructive" />
            )}
          </div>
        )}

        {/* Remove button */}
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute right-2 top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemove}
          disabled={progress?.status === "uploading"}
        >
          <Icons.close className="h-4 w-4" />
        </Button>
      </div>

      {/* File info */}
      <div className="p-2">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>

        {/* Progress bar */}
        {progress?.status === "uploading" && (
          <Progress value={progress.progress} className="mt-2 h-1" />
        )}

        {/* Error message */}
        {progress?.status === "error" && (
          <p className="mt-1 truncate text-xs text-destructive">
            {progress.error}
          </p>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
