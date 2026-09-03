/**
 * Your Highness's Matching Engine v6.5 (Final Integrated Edition)
 * Features: Neon Button, Auto-Hide Status, Comprehensive ROI Summary
 */

// --- 🌐 API 베이스 주소 ---
// 우선순위: ?api=<주소> 쿼리 파라미터 > localStorage 저장값 > 기본값(운영)
// 로컬/터널 백엔드로 붙일 때는 ?api=<새 주소> 로 한 번만 접속하면 저장된다.
// 원래대로 되돌리려면 ?api=reset
const DEFAULT_API_BASE = 'https://d3vun18xqshzq8.cloudfront.net';
const API_BASE = (() => {
    const q = new URLSearchParams(location.search).get('api');
    if (q === 'reset') {
        localStorage.removeItem('coredev_api_base');
    } else if (q) {
        localStorage.setItem('coredev_api_base', q.replace(/\/+$/, ''));
    }
    return (localStorage.getItem('coredev_api_base') || DEFAULT_API_BASE).replace(/\/+$/, '');
})();

const CONFIG = {
    CLIENT_ID: '1008555021998-vqbtfp8nmu5uhdgu9vdosnovsifhv449.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDY5KzY0zUQi5sEO0nyHCJeYy1qr1V3ZX0',
    DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    DEFAULT_SHEET_ID: '17m7yXKC8Pow9ovak5j_5_74sNckMH2bldRR0C-lG78M',
    COREDEV_LECTURE_API: `${API_BASE}/lecture`,
    COREDEV_HISTORY_API: `${API_BASE}/tracking-history`,
    COREDEV_LOGIN_API: `${API_BASE}/login/local-login`,
    // 기본값은 localStorage에서 가져오거나 빈 문자열
    COREDEV_AUTH: '',
};

const State = {
    trackingMap: new Map(),
    mediumTotalStats: new Map(),
    free: [],
    selectedLectures: [],
    loadedTabs: [],
    lastDetailRows: [], // 매칭된 결제자 상세 (엑셀 다운로드용)
};

const $ = (id) => document.getElementById(id);

// --- 💡 UI Utils (상태 메시지 자동 숨김 로직 포함) ---
const showToast = (m) => {
    const t = $('toast');
    t.innerText = m;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 3000);
};

const updateStatus = (m) => {
    const s = $('app_status');
    if (!s) return;
    if (!m || m.trim() === '') {
        s.style.display = 'none'; // 메시지가 없으면 영역 자체를 숨김
    } else {
        s.style.display = 'inline-block';
        s.innerText = m;
    }
};

const normalizePhone = (v) => {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('82')) d = '0' + d.slice(2);
    if (d.length === 10 && d.startsWith('10')) d = '0' + d;
    return d.length >= 10 && d.startsWith('01') ? d : null;
};

const parseAmount = (v) => parseInt(String(v || '0').replace(/[^0-9]/g, '')) || 0;

const escapeHtml = (s) => {
    const str = String(s ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

// --- 🔐 코어데브 인증 토큰 관리 ---
const COREDEV_TOKEN_KEY = 'coredev_auth_token';

function getCoredevToken() {
    return localStorage.getItem(COREDEV_TOKEN_KEY) || '';
}

function setCoredevToken(token) {
    localStorage.setItem(COREDEV_TOKEN_KEY, token);
    CONFIG.COREDEV_AUTH = token;
}

function clearCoredevToken() {
    localStorage.removeItem(COREDEV_TOKEN_KEY);
    CONFIG.COREDEV_AUTH = '';
}

// 페이지 로드 시 저장된 토큰 확인
function initCoredevAuth() {
    const savedToken = getCoredevToken();
    if (savedToken) {
        CONFIG.COREDEV_AUTH = savedToken;
    }
}

// 코어데브 자동 로그인 함수 (admin/admin!23)
async function autoLoginToCoredev() {
    // 이미 토큰이 있고 유효한지 확인 (간단한 체크)
    const savedToken = getCoredevToken();
    if (savedToken) {
        CONFIG.COREDEV_AUTH = savedToken;
        return true; // 이미 로그인되어 있음
    }

    try {
        updateStatus('코어데브 로그인 중...');

        // 로그인 API 호출 (admin/admin!23 자동 로그인)
        const resp = await fetch(CONFIG.COREDEV_LOGIN_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                loginId: 'admin',
                loginPw: 'admin!23',
            }),
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            throw new Error(errorData.message || `로그인 실패: ${resp.status} ${resp.statusText}`);
        }

        const data = await resp.json();

        // 응답에서 accessToken 추출
        const token = data.accessToken;

        if (!token) {
            throw new Error('토큰을 받지 못했습니다.');
        }

        setCoredevToken(token);
        updateStatus('');
        return true;
    } catch (e) {
        console.error('코어데브 자동 로그인 오류:', e);
        updateStatus('');
        alert(`코어데브 로그인 실패: ${e.message || '알 수 없는 오류가 발생했습니다.'}`);
        return false;
    }
}

// --- ⚙️ Google API 초기화 및 네온 효과 제어 ---
window.onload = () => {
    // 코어데브 인증 초기화
    initCoredevAuth();

    gapi.load('client', async () => {
        await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: CONFIG.DISCOVERY_DOCS });
        const authBtn = $('auth_btn');
        if (authBtn) {
            authBtn.disabled = false; // 버튼 활성화 (이때 CSS의 네온 애니메이션이 작동함)
            updateStatus('Google 연동을 진행해 주십시오.');
        }
    });

    window.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: async (resp) => {
            if (resp.error) return;

            const authBtn = $('auth_btn');
            authBtn.innerText = '✅ Google 연동 완료';
            authBtn.classList.remove('btn-neon'); // 네온사인 애니메이션 제거
            authBtn.style.animation = 'none';
            authBtn.style.borderColor = '#34a853'; // 성공의 녹색 테두리

            updateStatus(''); // 💡 [핵심] 연동 완료 시 상태 문구 즉시 제거
            showToast('Google 시트 연동 성공');

            updateStatus('탭 목록 로드 중...');
            await fetchTabs(CONFIG.DEFAULT_SHEET_ID);
            updateStatus(''); // 로드 완료 후 다시 숨김
        },
    });
};

// 구글 연동 버튼 클릭 시 코어데브 자동 로그인 먼저 실행
$('auth_btn').onclick = async () => {
    // 먼저 코어데브 자동 로그인 실행
    const coredevLoginSuccess = await autoLoginToCoredev();

    if (!coredevLoginSuccess) {
        // 코어데브 로그인 실패 시 구글 연동 진행하지 않음
        return;
    }

    // 코어데브 로그인 성공 후 구글 연동 진행
    window.tokenClient.requestAccessToken();
};

// --- 🔍 강의 검색 및 모달 제어 ---
$('btn_open_search').onclick = () => {
    $('search_modal').style.display = 'block';
};
$('close_modal').onclick = () => {
    $('search_modal').style.display = 'none';
};

$('do_search').onclick = async () => {
    const kw = $('search_input').value.trim();
    if (!kw) return;

    // 토큰 확인 및 자동 로그인
    if (!CONFIG.COREDEV_AUTH) {
        updateStatus('코어데브 자동 로그인 중...');
        const loginSuccess = await autoLoginToCoredev();
        if (!loginSuccess) {
            alert('코어데브 로그인에 실패했습니다. 구글 연동 버튼을 다시 눌러주세요.');
            return;
        }
    }

    try {
        updateStatus('강의 정보를 찾는 중...');
        const url = `${CONFIG.COREDEV_LECTURE_API}?page=0&size=20&name=${encodeURIComponent(
            kw
        )}&isPaid=false`;
        let resp = await fetch(url, { headers: { 'Nuf-Authorization': CONFIG.COREDEV_AUTH } });

        if (!resp.ok) {
            if (resp.status === 403) {
                // 토큰 만료 시 자동 재로그인 시도
                clearCoredevToken();
                updateStatus('토큰 만료. 자동 재로그인 중...');
                const loginSuccess = await autoLoginToCoredev();
                if (!loginSuccess) {
                    alert(
                        '인증 토큰이 만료되었고 재로그인에 실패했습니다. 구글 연동 버튼을 다시 눌러주세요.'
                    );
                    throw new Error(`API 요청 실패: ${resp.status} ${resp.statusText}`);
                }
                // 재로그인 성공 후 다시 요청
                resp = await fetch(url, { headers: { 'Nuf-Authorization': CONFIG.COREDEV_AUTH } });
                if (!resp.ok) {
                    throw new Error(`API 요청 실패: ${resp.status} ${resp.statusText}`);
                }
            } else {
                throw new Error(`API 요청 실패: ${resp.status} ${resp.statusText}`);
            }
        }

        const data = await resp.json();
        $('search_results').innerHTML = data.content
            .map(
                (lec) => `
            <div class="search-item" onclick="this.querySelector('input').click()">
                <input type="checkbox" value="${lec.id}" data-name="${lec.name}" onclick="event.stopPropagation()">
                <span>${lec.name}</span>
            </div>
        `
            )
            .join('');
    } catch (e) {
        console.error('검색 오류:', e);
        alert(`검색 실패: ${e.message || '알 수 없는 오류가 발생했습니다.'}`);
    } finally {
        updateStatus('');
    }
};

$('selection_complete').onclick = () => {
    const checked = document.querySelectorAll('#search_results input:checked');
    State.selectedLectures = Array.from(checked).map((c) => ({
        id: c.value,
        name: c.dataset.name,
    }));
    $('selected_count').innerText = `${State.selectedLectures.length}개의 강의가 선택되었습니다.`;
    $('search_modal').style.display = 'none';
};

// --- 📊 탭 선택 드롭다운 로직 ---
const trigger = $('tabs_select_trigger');
const dropdown = $('tabs_dropdown');
const searchInput = $('tabs_search_input');

trigger.onclick = () => {
    if (State.loadedTabs.length === 0) return;
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    searchInput.focus();
};

searchInput.oninput = (e) => {
    const term = e.target.value.toLowerCase();
    renderDropdownItems(State.loadedTabs.filter((t) => t.toLowerCase().includes(term)));
};

function renderDropdownItems(tabs) {
    const list = $('tabs_list_items');
    list.innerHTML = tabs.map((t) => `<li onclick="selectTabItem('${t}')">${t}</li>`).join('');
}

window.selectTabItem = async function (tabName) {
    trigger.innerText = tabName;
    dropdown.style.display = 'none';
    updateStatus(`[${tabName}] 로드 중...`);
    try {
        const resp = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.DEFAULT_SHEET_ID,
            range: `'${tabName}'!A:Z`,
        });
        State.free = resp.result.values.slice(1);
        showToast(`탭 로드 완료: ${tabName}`);
        $('run_match').disabled = false;
    } catch (e) {
        alert('데이터 로드 실패');
    } finally {
        updateStatus('');
    }
};

async function fetchTabs(id) {
    try {
        const resp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: id });
        State.loadedTabs = resp.result.sheets.map((s) => s.properties.title);
        renderDropdownItems(State.loadedTabs);
        trigger.innerText = '분석할 탭을 선택해 주세요';
    } catch (e) {
        alert('탭 목록 로드 실패');
    }
}

// --- 🚀 성과 분석 실행 엔진 ---
$('run_match').onclick = async () => {
    try {
        updateStatus('분석 엔진 가동 중...');
        State.trackingMap.clear();
        State.mediumTotalStats.clear();
        for (const lecture of State.selectedLectures) {
            await fetchRecursiveHistory(lecture);
        }
        renderFinalReport();
    } catch (e) {
        alert('분석 중 오류 발생');
    } finally {
        updateStatus('');
    }
};

async function fetchRecursiveHistory(lecture, page = 0) {
    // 토큰 확인 및 자동 로그인
    if (!CONFIG.COREDEV_AUTH) {
        const loginSuccess = await autoLoginToCoredev();
        if (!loginSuccess) {
            throw new Error('코어데브 로그인에 실패했습니다.');
        }
    }

    const url = `${CONFIG.COREDEV_HISTORY_API}?page=${page}&size=500&lecture=${lecture.id}`;
    let resp = await fetch(url, { headers: { 'Nuf-Authorization': CONFIG.COREDEV_AUTH } });

    if (!resp.ok) {
        if (resp.status === 403) {
            // 토큰 만료 시 자동 재로그인 시도
            clearCoredevToken();
            const loginSuccess = await autoLoginToCoredev();
            if (!loginSuccess) {
                throw new Error('인증 토큰이 만료되었고 재로그인에 실패했습니다.');
            }
            // 재로그인 성공 후 다시 요청
            resp = await fetch(url, { headers: { 'Nuf-Authorization': CONFIG.COREDEV_AUTH } });
            if (!resp.ok) {
                throw new Error(`API 요청 실패: ${resp.status} ${resp.statusText}`);
            }
        } else {
            throw new Error(`API 요청 실패: ${resp.status} ${resp.statusText}`);
        }
    }

    const data = await resp.json();
    data.content.forEach((app) => {
        const mediumName = app.medium && app.medium.name ? app.medium.name : '미지정(직접유입)';
        const phone = normalizePhone(app.billingPhone);
        if (phone) State.trackingMap.set(phone, mediumName);
        State.mediumTotalStats.set(mediumName, (State.mediumTotalStats.get(mediumName) || 0) + 1);
    });
    if (data.last === false) await fetchRecursiveHistory(lecture, page + 1);
}

// --- 📊 최종 리포트 렌더링 (요약 섹션 강화) ---
function renderFinalReport() {
    let totalRevenue = 0;
    const stats = { paid: {}, organic: {}, other: { m: 0, s: 0 } };
    const detailRows = []; // 매칭된 결제자 상세 목록

    State.free.forEach((row) => {
        const phone = normalizePhone(row[4]);
        const amount = parseAmount(row[14]);
        if (amount <= 0) return;
        totalRevenue += amount;
        const medium = State.trackingMap.get(phone);
        const matchedMedium = medium || '기타(매칭없음)';
        detailRows.push({
            name: String(row[3] ?? '').trim(),
            email: String(row[5] ?? '').trim(),
            phoneDisplay: String(row[4] ?? '').trim(),
            amount,
            matchedMedium,
        });
        if (medium) {
            const cat = medium.includes('구글') || medium.includes('메타') ? 'paid' : 'organic';
            if (!stats[cat][medium])
                stats[cat][medium] = { m: 0, s: 0, t: State.mediumTotalStats.get(medium) || 0 };
            stats[cat][medium].m++;
            stats[cat][medium].s += amount;
        } else {
            stats.other.m++;
            stats.other.s += amount;
        }
    });

    let pSum = { m: 0, t: 0, s: 0 };
    let oSum = { m: 0, t: 0, s: 0 };
    Object.values(stats.paid).forEach((v) => {
        pSum.m += v.m;
        pSum.t += v.t;
        pSum.s += v.s;
    });
    Object.values(stats.organic).forEach((v) => {
        oSum.m += v.m;
        oSum.t += v.t;
        oSum.s += v.s;
    });

    const formatRow = (name, m, t, s, total) => {
        const rate = t > 0 ? ((m / t) * 100).toFixed(1) : '0.0';
        const portion = total > 0 ? ((s / total) * 100).toFixed(1) : '0.0';
        return `<tr><td>${name}</td><td>${m}/${t}</td><td>${rate}%</td><td>${s.toLocaleString()}원</td><td>${portion}%</td></tr>`;
    };

    let html = '';

    // 매칭된 결제자 상세 테이블 (결과 항목에 결제자 정보 표시)
    const detailTableRows = detailRows
        .map(
            (r) =>
                `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td>${escapeHtml(r.phoneDisplay)}</td><td>${r.amount.toLocaleString()}원</td><td>${escapeHtml(r.matchedMedium)}</td></tr>`
        )
        .join('');
    html += `
        <div class="report-section">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                <h3 style="margin:0;">📋 매칭된 결제자 상세</h3>
                <button type="button" id="dl_matched_excel" class="btn btn-primary">📥 엑셀 다운로드</button>
            </div>
            <table>
                <thead><tr><th>이름</th><th>이메일</th><th>연락처</th><th>결제금액</th><th>매칭된 유입매체(결제자)</th></tr></thead>
                <tbody>${detailTableRows || '<tr><td colspan="5" style="text-align:center">결제 데이터 없음</td></tr>'}</tbody>
            </table>
        </div>
    `;

    const buildSection = (title, data) => {
        let rows = Object.entries(data)
            .map(([n, v]) => formatRow(n, v.m, v.t, v.s, totalRevenue))
            .join('');
        return `<div class="report-section"><h3>${title}</h3><table><thead><tr><th>유입 매체</th><th>매칭/트래킹</th><th>전환율</th><th>매출 합계</th><th>비중</th></tr></thead><tbody>${
            rows || '<tr><td colspan="5" style="text-align:center">데이터 없음</td></tr>'
        }</tbody></table></div>`;
    };

    html += buildSection('① 페이드 (광고 유입)', stats.paid);
    html += buildSection('② 오가닉 (추천 및 오가닉)', stats.organic);

    const otherPortion =
        totalRevenue > 0 ? ((stats.other.s / totalRevenue) * 100).toFixed(1) : '0.0';
    html += `<div class="report-section"><h3>③ 기타 (매칭 정보 없음)</h3><table><thead><tr><th>유입 매체</th><th>매칭</th><th>전환율</th><th>매출 합계</th><th>비중</th></tr></thead><tbody><tr><td>기타(직접/기존유입)</td><td>${
        stats.other.m
    }/-</td><td>-</td><td>${stats.other.s.toLocaleString()}원</td><td>${otherPortion}%</td></tr></tbody></table></div>`;

    // 💡 유어하이니스께서 요청하신 캡처 양식의 요약 카드
    html += `
        <div class="summary-card">
            <h3 style="margin-top:0">📈 성과 분석 종합 요약</h3>
            <p class="summary-line"><strong>페이드 요약</strong> : ${pSum.m}/${pSum.t} 전환율: ${
        pSum.t > 0 ? ((pSum.m / pSum.t) * 100).toFixed(1) : 0
    }% 결제금액 합계: ${pSum.s.toLocaleString()}원</p>
            <p class="summary-line"><strong>오가닉 요약</strong> : ${oSum.m}/${oSum.t} 전환율: ${
        oSum.t > 0 ? ((oSum.m / oSum.t) * 100).toFixed(1) : 0
    }% 결제금액 합계: ${oSum.s.toLocaleString()}원</p>
            <p style="font-size: 24px; color: var(--primary); font-weight: 800; margin: 15px 0 0; letter-spacing:-0.5px">전체 결제금액 합계 : ${totalRevenue.toLocaleString()}원</p>
        </div>
    `;

    State.lastDetailRows = detailRows;

    $('report_container').innerHTML = html;

    const dlBtn = $('dl_matched_excel');
    if (dlBtn) dlBtn.onclick = downloadMatchedExcel;

    showToast('성과 분석 완료');
}

// 매칭된 결제자 상세 엑셀 다운로드
function downloadMatchedExcel() {
    const rows = State.lastDetailRows;
    if (!rows || rows.length === 0) {
        showToast('다운로드할 데이터가 없습니다.');
        return;
    }
    const aoa = [
        ['이름', '이메일', '연락처', '결제금액', '매칭된 유입매체(결제자)'],
        ...rows.map((r) => [r.name, r.email, r.phoneDisplay, r.amount, r.matchedMedium]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '매칭된 결제자');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `매칭된_결제자_${dateStr}.xlsx`);
    showToast('엑셀 다운로드 완료');
}

$('reset_btn').onclick = () => {
    if (confirm('초기화하시겠습니까?')) location.reload();
};
