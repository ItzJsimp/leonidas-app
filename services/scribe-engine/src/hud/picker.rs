//! Focus-taking preset picker, with its own message loop on the caller's worker thread.
use std::{
    cell::RefCell,
    ptr::{null, null_mut},
};
use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Gdi::*,
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::*,
};

const WIDTH: i32 = 300;
const ROW: i32 = 38;
const PAD: i32 = 8;
const FOOTER: i32 = 26;
/// The picker closes by itself, so it can never stay on screen.
const TIMEOUT_MS: u32 = 30_000;

fn row_at(y: i32, count: usize) -> Option<usize> {
    (y >= PAD)
        .then_some(((y - PAD) / ROW) as usize)
        .filter(|&i| i < count)
}
fn digit_index(key: u32, count: usize) -> Option<usize> {
    (0x31..=0x39)
        .contains(&key)
        .then_some((key.saturating_sub(0x31)) as usize)
        .filter(|&i| i < count)
}
struct Picker {
    names: Vec<String>,
    selected: usize,
    result: Option<usize>,
}
thread_local! { static PICKER: RefCell<Option<Picker>> = const { RefCell::new(None) }; }
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match msg {
        WM_KILLFOCUS | WM_TIMER => {
            DestroyWindow(hwnd);
            0
        }
        WM_KEYDOWN => {
            let mut close = false;
            PICKER.with(|p| {
                if let Some(p) = p.borrow_mut().as_mut() {
                    match w as u32 {
                        0x1b => close = true,
                        0x26 => {
                            p.selected = (p.selected + p.names.len() - 1) % p.names.len();
                        }
                        0x28 => {
                            p.selected = (p.selected + 1) % p.names.len();
                        }
                        0x0d => {
                            p.result = Some(p.selected);
                            close = true;
                        }
                        key => {
                            if let Some(i) = digit_index(key, p.names.len()) {
                                p.result = Some(i);
                                close = true;
                            }
                        }
                    }
                }
            });
            if close {
                DestroyWindow(hwnd);
            } else {
                InvalidateRect(hwnd, null(), 0);
            }
            0
        }
        WM_LBUTTONUP => {
            PICKER.with(|p| {
                if let Some(p) = p.borrow_mut().as_mut() {
                    p.result = row_at(((l >> 16) as i16) as i32, p.names.len());
                }
            });
            DestroyWindow(hwnd);
            0
        }
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let dc = BeginPaint(hwnd, &mut ps);
            let mut rect: RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rect);
            let bg = CreateSolidBrush(0x00201c1a);
            FillRect(dc, &rect, bg);
            DeleteObject(bg as _);
            SetBkMode(dc, TRANSPARENT as i32);
            SetTextColor(dc, 0x00f2eeeb);
            let face = wide("Segoe UI");
            // Height -15 px, weight 400, CLEARTYPE_QUALITY (5).
            let font = CreateFontW(-15, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 5, 0, face.as_ptr());
            let old_font = SelectObject(dc, font as _);
            PICKER.with(|p| {
                if let Some(p) = p.borrow().as_ref() {
                    for (i, name) in p.names.iter().enumerate() {
                        let top = PAD + i as i32 * ROW;
                        let mut r = RECT {
                            left: PAD,
                            top,
                            right: WIDTH - PAD,
                            bottom: top + ROW,
                        };
                        if i == p.selected {
                            let brush = CreateSolidBrush(0x00413b36);
                            FillRect(dc, &r, brush);
                            DeleteObject(brush as _);
                        }
                        r.left += 10;
                        let label = wide(&format!("{}  {}", i + 1, name));
                        DrawTextW(
                            dc,
                            label.as_ptr(),
                            -1,
                            &mut r,
                            DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS,
                        );
                    }
                    let top = PAD + p.names.len() as i32 * ROW;
                    let mut r = RECT {
                        left: PAD + 10,
                        top,
                        right: WIDTH - PAD,
                        bottom: top + FOOTER,
                    };
                    SetTextColor(dc, 0x009a928c);
                    let hint = wide("1-9 or Enter to rewrite, Esc to close");
                    DrawTextW(dc, hint.as_ptr(), -1, &mut r, DT_SINGLELINE | DT_VCENTER);
                }
            });
            SelectObject(dc, old_font);
            DeleteObject(font as _);
            EndPaint(hwnd, &ps);
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}

pub fn pick(names: &[String]) -> Option<usize> {
    if names.is_empty() {
        return None;
    }
    PICKER.with(|p| {
        *p.borrow_mut() = Some(Picker {
            names: names.to_vec(),
            selected: 0,
            result: None,
        })
    });
    unsafe {
        let instance = GetModuleHandleW(null());
        let class = wide("LeonidasScribePresetPicker");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance,
            lpszClassName: class.as_ptr(),
            hCursor: LoadCursorW(null_mut(), IDC_ARROW),
            ..std::mem::zeroed()
        };
        RegisterClassW(&wc);
        let mut point: POINT = std::mem::zeroed();
        GetCursorPos(&mut point);
        let height = PAD * 2 + ROW * names.len() as i32 + FOOTER;
        let mut monitor: MONITORINFO = std::mem::zeroed();
        monitor.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(
            MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST),
            &mut monitor,
        ) != 0
        {
            let area = monitor.rcWork;
            point.x = point
                .x
                .clamp(area.left, (area.right - WIDTH).max(area.left));
            point.y = point
                .y
                .clamp(area.top, (area.bottom - height).max(area.top));
        }
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            class.as_ptr(),
            class.as_ptr(),
            WS_POPUP,
            point.x,
            point.y,
            WIDTH,
            height,
            null_mut(),
            null_mut(),
            instance,
            null(),
        );
        if !hwnd.is_null() {
            let region = CreateRoundRectRgn(0, 0, WIDTH + 1, height + 1, 16, 16);
            SetWindowRgn(hwnd, region, 1);
            ShowWindow(hwnd, SW_SHOW);
            // A background process may not take the foreground. Sharing the input state of
            // the foreground thread during the call lets SetForegroundWindow work.
            let me = GetCurrentThreadId();
            let front = GetWindowThreadProcessId(GetForegroundWindow(), null_mut());
            let attached = front != 0 && front != me && AttachThreadInput(me, front, 1) != 0;
            SetForegroundWindow(hwnd);
            SetFocus(hwnd);
            if attached {
                AttachThreadInput(me, front, 0);
            }
            if GetForegroundWindow() == hwnd {
                SetTimer(hwnd, 1, TIMEOUT_MS, None);
            } else {
                // Without focus the keys would go to the user's document: close at once.
                DestroyWindow(hwnd);
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
    PICKER.with(|p| p.borrow_mut().take().and_then(|p| p.result))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mapping() {
        assert_eq!(row_at(8, 2), Some(0));
        assert_eq!(row_at(46, 2), Some(1));
        assert_eq!(row_at(7, 2), None);
        assert_eq!(digit_index(0x32, 2), Some(1));
        assert_eq!(digit_index(0x33, 2), None);
    }
}
