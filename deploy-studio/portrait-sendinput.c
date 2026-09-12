/*
 * portrait-sendinput.c — Wine-side input via SendInput.
 *
 * Mouse wheel reliably reaches Imagine under Wine; keyboard uses VK+scancode
 * (DirectInput-friendly). Build 32-bit to match ImagineClient.exe:
 *
 *   ./build-sendinput.sh
 *   # or: i686-w64-mingw32-gcc -O2 -o portrait-sendinput.exe portrait-sendinput.c -luser32
 *
 * Usage (same DISPLAY / WINEPREFIX as Imagine):
 *   wine portrait-sendinput.exe [--title "IMAGINE Version 1.666"] hold s 2000
 *   wine portrait-sendinput.exe hold home 1100
 *   wine portrait-sendinput.exe hold prior 500
 *   wine portrait-sendinput.exe wheel -8
 *   wine portrait-sendinput.exe tap escape
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int is_extended(WORD vk) {
  switch (vk) {
    case VK_HOME:
    case VK_END:
    case VK_PRIOR:
    case VK_NEXT:
    case VK_INSERT:
    case VK_DELETE:
    case VK_LEFT:
    case VK_RIGHT:
    case VK_UP:
    case VK_DOWN:
    case VK_RCONTROL:
    case VK_RMENU:
      return 1;
    default:
      return 0;
  }
}

static void key_event(WORD vk, BOOL up) {
  INPUT in[2];
  int n = 0;
  WORD scan = (WORD)MapVirtualKey(vk, MAPVK_VK_TO_VSC);
  DWORD ext = is_extended(vk) ? KEYEVENTF_EXTENDEDKEY : 0;

  ZeroMemory(&in[n], sizeof(INPUT));
  in[n].type = INPUT_KEYBOARD;
  in[n].ki.wVk = vk;
  in[n].ki.wScan = scan;
  in[n].ki.dwFlags = ext | (up ? KEYEVENTF_KEYUP : 0);
  n++;

  if (scan) {
    ZeroMemory(&in[n], sizeof(INPUT));
    in[n].type = INPUT_KEYBOARD;
    in[n].ki.wVk = 0;
    in[n].ki.wScan = scan;
    in[n].ki.dwFlags =
        KEYEVENTF_SCANCODE | ext | (up ? KEYEVENTF_KEYUP : 0);
    n++;
  }
  SendInput(n, in, sizeof(INPUT));
}

static WORD lookup_vk(const char *name) {
  if (!_stricmp(name, "s"))
    return 'S';
  if (!_stricmp(name, "w"))
    return 'W';
  if (!_stricmp(name, "a"))
    return 'A';
  if (!_stricmp(name, "d"))
    return 'D';
  if (!_stricmp(name, "home"))
    return VK_HOME;
  if (!_stricmp(name, "prior") || !_stricmp(name, "pageup"))
    return VK_PRIOR;
  if (!_stricmp(name, "next") || !_stricmp(name, "pagedown"))
    return VK_NEXT;
  if (!_stricmp(name, "end"))
    return VK_END;
  if (!_stricmp(name, "escape") || !_stricmp(name, "esc"))
    return VK_ESCAPE;
  if (!_stricmp(name, "return") || !_stricmp(name, "enter"))
    return VK_RETURN;
  if (!_stricmp(name, "tab"))
    return VK_TAB;
  if (!_stricmp(name, "backspace") || !_stricmp(name, "back"))
    return VK_BACK;
  if (!_stricmp(name, "space"))
    return VK_SPACE;
  if (strlen(name) == 1) {
    char c = name[0];
    if (c >= 'a' && c <= 'z')
      return (WORD)(c - 'a' + 'A');
    if (c >= 'A' && c <= 'Z')
      return (WORD)c;
    if (c >= '0' && c <= '9')
      return (WORD)c;
  }
  return 0;
}

typedef struct {
  const char *title;
  HWND hwnd;
} find_ctx;

typedef struct {
  unsigned long x11;
  HWND hwnd;
} x11_ctx;

static unsigned long wine_x11_wid(HWND hwnd) {
  static const char *props[] = {
      "__wine_x11_whole_window",
      "wine_x11_whole_window",
      "__wine_x11_wrapper_window",
      NULL};
  int i;
  for (i = 0; props[i]; i++) {
    HANDLE p = GetPropA(hwnd, props[i]);
    if (p)
      return (unsigned long)(uintptr_t)p;
  }
  return 0;
}

static BOOL CALLBACK find_visible_title(HWND hwnd, LPARAM lp) {
  find_ctx *ctx = (find_ctx *)lp;
  char buf[256];
  if (!IsWindowVisible(hwnd) || IsIconic(hwnd))
    return TRUE;
  if (GetWindowTextA(hwnd, buf, sizeof(buf)) <= 0)
    return TRUE;
  if (strstr(buf, ctx->title)) {
    ctx->hwnd = hwnd;
    return FALSE;
  }
  return TRUE;
}

static BOOL CALLBACK print_window(HWND hwnd, LPARAM lp) {
  char buf[256];
  unsigned long x11;
  (void)lp;
  if (!IsWindowVisible(hwnd) || GetWindowTextA(hwnd, buf, sizeof(buf)) <= 0)
    return TRUE;
  x11 = wine_x11_wid(hwnd);
  fprintf(stdout, "hwnd=%p x11=0x%lx iconic=%d title=%s\n",
          (void *)hwnd, x11, IsIconic(hwnd) ? 1 : 0, buf);
  return TRUE;
}

static BOOL CALLBACK find_x11_wid(HWND hwnd, LPARAM lp) {
  x11_ctx *ctx = (x11_ctx *)lp;
  unsigned long got = wine_x11_wid(hwnd);
  if (got && got == ctx->x11) {
    ctx->hwnd = hwnd;
    return FALSE;
  }
  return TRUE;
}

static int activate_hwnd(HWND hwnd) {
  if (!hwnd)
    return 0;
  ShowWindow(hwnd, SW_RESTORE);
  BringWindowToTop(hwnd);
  SetForegroundWindow(hwnd);
  return 1;
}

static int activate_x11(unsigned long x11) {
  x11_ctx ctx;
  ctx.x11 = x11;
  ctx.hwnd = NULL;
  if (!x11)
    return 0;
  EnumWindows(find_x11_wid, (LPARAM)&ctx);
  if (!ctx.hwnd)
    return 0;
  return activate_hwnd(ctx.hwnd);
}

static int activate_title(const char *title) {
  find_ctx ctx;
  HWND hwnd;
  ctx.title = title;
  ctx.hwnd = NULL;
  /* Last resort: dual clients share a title — first visible match is often vam1. */
  EnumWindows(find_visible_title, (LPARAM)&ctx);
  hwnd = ctx.hwnd ? ctx.hwnd : FindWindowA(NULL, title);
  return activate_hwnd(hwnd);
}

static void wheel_notches(int notches) {
  INPUT in;
  ZeroMemory(&in, sizeof(in));
  in.type = INPUT_MOUSE;
  in.mi.dwFlags = MOUSEEVENTF_WHEEL;
  in.mi.mouseData = (DWORD)(notches * WHEEL_DELTA);
  SendInput(1, &in, sizeof(INPUT));
}

static void type_char(char c, int gap_ms) {
  WORD vk = 0;
  int shift = 0;
  if (c >= 'A' && c <= 'Z') {
    vk = (WORD)c;
    shift = 1;
  } else if (c >= 'a' && c <= 'z') {
    vk = (WORD)(c - 'a' + 'A');
  } else if (c >= '0' && c <= '9') {
    vk = (WORD)c;
  } else if (c == ' ') {
    vk = VK_SPACE;
  } else if (c == '\t') {
    vk = VK_TAB;
  } else if (c == '\n' || c == '\r') {
    vk = VK_RETURN;
  } else if (c == '-') {
    vk = VK_OEM_MINUS;
  } else if (c == '_') {
    vk = VK_OEM_MINUS;
    shift = 1;
  } else {
    return;
  }
  if (shift) {
    key_event(VK_SHIFT, FALSE);
    Sleep(15);
  }
  key_event(vk, FALSE);
  Sleep(35);
  key_event(vk, TRUE);
  if (shift) {
    Sleep(10);
    key_event(VK_SHIFT, TRUE);
  }
  if (gap_ms < 10)
    gap_ms = 10;
  Sleep((DWORD)gap_ms);
}

static void usage(void) {
  fprintf(stderr,
          "usage: portrait-sendinput.exe [--x11-wid HEX] [--title TITLE] hold KEY MS\n"
          "       portrait-sendinput.exe [--x11-wid HEX] [--title TITLE] tap KEY\n"
          "       portrait-sendinput.exe [--x11-wid HEX] [--title TITLE] type TEXT\n"
          "       portrait-sendinput.exe [--x11-wid HEX] [--title TITLE] wheel NOTCHES\n");
}

int main(int argc, char **argv) {
  const char *title = NULL;
  unsigned long x11_wid = 0;
  int i = 1;
  while (i < argc && strncmp(argv[i], "--", 2) == 0) {
    if (strcmp(argv[i], "--title") == 0 && i + 1 < argc) {
      title = argv[++i];
      ++i;
      continue;
    }
    if (strcmp(argv[i], "--x11-wid") == 0 && i + 1 < argc) {
      x11_wid = strtoul(argv[++i], NULL, 0);
      ++i;
      continue;
    }
    usage();
    return 2;
  }
  if (i >= argc) {
    usage();
    return 2;
  }

  if (x11_wid) {
    if (!activate_x11(x11_wid)) {
      fprintf(stderr,
              "error: no HWND for x11 wid 0x%lx "
              "(refusing title fallback — dual clients share a title)\n",
              x11_wid);
      return 2;
    }
    Sleep(80);
  } else if (title) {
    if (!activate_title(title))
      fprintf(stderr, "warn: FindWindow failed for %s\n", title);
    Sleep(80);
  }

  if (!_stricmp(argv[i], "list")) {
    EnumWindows(print_window, 0);
    return 0;
  }

  if (!_stricmp(argv[i], "wheel")) {
    int n = (i + 1 < argc) ? atoi(argv[i + 1]) : -5;
    if (n == 0)
      n = -5;
    wheel_notches(n);
    Sleep(40);
    return 0;
  }

  if (!_stricmp(argv[i], "type") && i + 1 < argc) {
    const char *text = argv[i + 1];
    int gap = 35;
    size_t n;
    if (i + 2 < argc)
      gap = atoi(argv[i + 2]);
    if (gap < 10)
      gap = 10;
    if (gap > 200)
      gap = 200;
    for (n = 0; text[n]; n++)
      type_char(text[n], gap);
    return 0;
  }

  if (!_stricmp(argv[i], "tap") && i + 1 < argc) {
    const char *key = argv[i + 1];
    WORD vk;
    /* Wine login often needs Shift+Tab to leave the password field. */
    if (!_stricmp(key, "shift+tab") || !_stricmp(key, "shift-tab") ||
        !_stricmp(key, "shift_tab") || !_stricmp(key, "iso_left_tab") ||
        !_stricmp(key, "backtab")) {
      key_event(VK_SHIFT, FALSE);
      Sleep(40);
      key_event(VK_TAB, FALSE);
      Sleep(40);
      key_event(VK_TAB, TRUE);
      Sleep(15);
      key_event(VK_SHIFT, TRUE);
      return 0;
    }
    vk = lookup_vk(key);
    if (!vk) {
      fprintf(stderr, "unknown key: %s\n", key);
      return 2;
    }
    key_event(vk, FALSE);
    Sleep(40);
    key_event(vk, TRUE);
    return 0;
  }

  if (!_stricmp(argv[i], "hold") && i + 2 < argc) {
    WORD vk = lookup_vk(argv[i + 1]);
    int ms = atoi(argv[i + 2]);
    if (!vk) {
      fprintf(stderr, "unknown key: %s\n", argv[i + 1]);
      return 2;
    }
    if (ms < 1)
      ms = 1;
    if (ms > 60000)
      ms = 60000;
    key_event(vk, FALSE);
    Sleep((DWORD)ms);
    key_event(vk, TRUE);
    return 0;
  }

  usage();
  return 2;
}
