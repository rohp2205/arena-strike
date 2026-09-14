"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) {
            return;
        }

        const registerServiceWorker = async () => {
            try {
                const registration = await navigator.serviceWorker.register(
                    "/sw.js",
                    {
                        scope: "/",
                        updateViaCache: "none",
                    }
                );

                await registration.update();
            } catch (error) {
                console.error(
                    "Arena Strike service worker registration failed:",
                    error
                );
            }
        };

        registerServiceWorker();
    }, []);

    return null;
}