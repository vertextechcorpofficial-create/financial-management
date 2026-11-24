"use client";

import { useEffect, useState } from "react";
import { attachmentUrl } from "../utils/attachments";

/** Keep async file detection and preview failures within React's state model. */
export function useAttachmentPreview(docUrl: string) {
    const viewUrl = attachmentUrl(docUrl);
    const [metadata, setMetadata] = useState<{ url: string; type: string; failed: boolean } | null>(null);
    const [failedImageUrl, setFailedImageUrl] = useState("");
    useEffect(() => {
        if (!viewUrl) return;
        const controller = new AbortController();
        fetch(viewUrl, { method: "HEAD", signal: controller.signal })
            .then(response => {
                if (controller.signal.aborted) return;
                setMetadata({ url: viewUrl, type: (response.headers.get("content-type") || "").toLowerCase(), failed: !response.ok });
            })
            .catch(() => {
                if (!controller.signal.aborted) setMetadata({ url: viewUrl, type: "", failed: true });
            });
        return () => controller.abort();
    }, [viewUrl]);

    const current = metadata?.url === viewUrl ? metadata : null;
    return {
        viewUrl,
        loadingPreview: Boolean(viewUrl && !current),
        previewFailed: Boolean(current?.failed || failedImageUrl === viewUrl),
        isPdf: Boolean(current?.type.includes("pdf") || docUrl.split("?")[0].toLowerCase().endsWith(".pdf")),
        onPreviewError: () => setFailedImageUrl(viewUrl),
    };
}
