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

static int activate_title(const char *title) {
  HWND hwnd = FindWindowA(NULL, title);
  if (!hwnd)
    return 0;
  ShowWindow(hwnd, SW_RESTORE);
  BringWindowToTop(hwnd);
  SetForegroundWindow(hwnd);
  return 1;
}

static void wheel_notches(int notches) {
  INPUT in;
  ZeroMemory(&in, sizeof(in));
  in.type = INPUT_MOUSE;
  in.mi.dwFlags = MOUSEEVENTF_WHEEL;
  in.mi.mouseData = (DWORD)(notches * WHEEL_DELTA);
  SendInput(1, &in, sizeof(INPUT));
}

static void usage(void) {
  fprintf(stderr,
          "usage: portrait-sendinput.exe [--title TITLE] hold KEY MS\n"
          "       portrait-sendinput.exe [--title TITLE] tap KEY\n"
          "       portrait-sendinput.exe [--title TITLE] wheel NOTCHES\n");
}

int main(int argc, char **argv) {
  const char *title = NULL;
  int i = 1;
  while (i < argc && strncmp(argv[i], "--", 2) == 0) {
    if (strcmp(argv[i], "--title") == 0 && i + 1 < argc) {
      title = argv[++i];
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

  if (title) {
    if (!activate_title(title))
      fprintf(stderr, "warn: FindWindow failed for %s\n", title);
    Sleep(80);
  }

  if (!_stricmp(argv[i], "wheel")) {
    int n = (i + 1 < argc) ? atoi(argv[i + 1]) : -5;
    if (n == 0)
      n = -5;
    wheel_notches(n);
    Sleep(40);
    return 0;
  }

  if (!_stricmp(argv[i], "tap") && i + 1 < argc) {
    WORD vk = lookup_vk(argv[i + 1]);
    if (!vk) {
      fprintf(stderr, "unknown key: %s\n", argv[i + 1]);
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
