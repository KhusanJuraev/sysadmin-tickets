import type { TelegramUser } from ".";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: TelegramUser;
        };
        colorScheme?: "light" | "dark";
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton?: {
          text: string;
          show: () => void;
          hide: () => void;
        };
      };
    };
  }
}

export {};
