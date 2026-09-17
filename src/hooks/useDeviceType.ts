import { useEffect, useState } from "react";

export type DeviceType = "touch" | "desktop";

function detect(): DeviceType {
  if (typeof window === "undefined") return "desktop";
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowScreen = window.matchMedia("(max-width: 820px)").matches;
  return coarsePointer || narrowScreen ? "touch" : "desktop";
}

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(detect);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    const widthQuery = window.matchMedia("(max-width: 820px)");
    const update = () => setDevice(detect());

    pointerQuery.addEventListener("change", update);
    widthQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      pointerQuery.removeEventListener("change", update);
      widthQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return device;
}
