import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { dismissInstall, isInstallDismissed, isIos, isStandalone } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const location = useLocation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const hasTabBar = !["/", "/login", "/signup"].includes(location.pathname);

  useEffect(() => {
    if (isStandalone() || isInstallDismissed()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIos()) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (isStandalone()) return null;
  if (!visible && !iosHint) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice.outcome !== "accepted") dismissInstall();
  }

  function hide() {
    dismissInstall();
    setVisible(false);
    setIosHint(false);
  }

  return (
    <div
      className={`fixed left-3 right-3 z-[60] lg:bottom-4 lg:left-auto lg:right-4 lg:w-[360px] animate-fade-up ${
        hasTabBar ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="glass-strong rounded-2xl p-3.5 shadow-glow-sm flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-display font-black shrink-0">
          H
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Install Helios</p>
          <p className="text-[12px] text-grey mt-0.5 leading-snug">
            {iosHint && !deferred
              ? "On iPhone: Share, then Add to Home Screen."
              : "Add Helios to your home screen and use it like an app."}
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            {deferred && (
              <button type="button" onClick={() => void install()} className="btn-primary !px-3 !py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="download" className="w-3.5 h-3.5" />
                  Install
                </span>
              </button>
            )}
            <button type="button" onClick={hide} className="text-xs text-faint hover:text-ink px-2 py-1.5">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
