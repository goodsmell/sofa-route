import React, {useEffect, useRef, useState} from 'react';
import {fmt, normalizePhone, digits, workMin, stopFacts, shortArea, toMin} from './logic.js';
import {legInfo, fmtDuration, routeTotals} from './tmapRoute.js';

const tmap = s => 'tmap://search?name=' + encodeURIComponent(s);
const DAY = '일월화수목금토';
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const PhoneIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6c0 1-.8 1.8-1.8 1.8C10.4 19.2 4.8 13.6 4.8 5.3c0-1 .8-1.8 1.8-1.8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>;
const GripIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
const NaviIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>;

function WeekStrip({day, history, onOpenDay}) {
  const base = new Date(day.date + 'T00:00:00');
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const dates = Array.from({length: 7}, (_, i) => {const d = new Date(monday); d.setDate(monday.getDate() + i); return d});
  const todayIso = iso(new Date());
  return <div className="week" role="list" aria-label="이번 주 배송">
    {dates.map(d => {
      const date = iso(d), record = date === day.date ? day : history[date], count = record?.list?.length || 0;
      return <button key={date} role="listitem" type="button" className={'week-day' + (date === day.date ? ' on' : '') + (date === todayIso ? ' today' : '')} aria-current={date === day.date ? 'date' : undefined} onClick={() => onOpenDay(date)}>
        <span>{DAY[d.getDay()]}</span><strong>{d.getDate()}</strong><small>{count ? count + '곳' : '-'}</small>
      </button>;
    })}
  </div>;
}

function Leg({day, i, busy}) {
  const info = legInfo(day, i);
  if (info.state === 'tmap') return <div className="leg"><span>{fmtDuration(info.min)}</span><small>{info.km}km</small></div>;
  return <div className="leg muted"><small>{busy ? '이동 시간 계산 중' : '이동 시간 모름'}</small></div>;
}

function StopCard({row, index, count, open, onToggle, reminder, actions, grip, dragging, target}) {
  const c = row.c;
  const phone = c.phone || c.safePhone;
  const late = row.flags.some(([k]) => k === 'bad');
  const badges = [
    c.promiseTime ? c.promiseTime + ' 약속' : c.slot === 'am' ? '오전 약속' : c.slot === 'pm' ? '오후 약속' : null,
    c.noelev ? '엘리베이터 없음' : null,
    c.bs ? '기존 소파 수거' : null,
  ].filter(Boolean);
  return <article className={'stop' + (c.done ? ' done' : '') + (open ? ' open' : '') + (dragging ? ' dragging' : '') + (target ? ' drop-target' : '')}>
    <div className="stop-head">
      <button type="button" className="stop-main" aria-expanded={open} onClick={onToggle}>
        <span className="stop-no">{index + 1}</span>
        <span className="stop-text"><strong>{c.name || '이름 확인'}</strong></span>
      </button>
      {phone && !c.done && <a className="round" href={'tel:' + digits(phone)} aria-label={(c.name || '고객') + ' 전화'}><PhoneIcon/></a>}
      {count > 1 && <button type="button" className="grip" aria-label={(c.name || '고객') + ' 순서 옮기기. 누른 채로 위아래로 끄세요'} {...grip}><GripIcon/><small>옮기기</small></button>}
    </div>
    <button type="button" className="stop-area" onClick={onToggle} tabIndex={-1}>{shortArea(c.addr) || '주소 확인 필요'}</button>
    {(badges.length > 0 || late || reminder || c.done) && <div className="badges">
      {c.done && <span className="badge ok">완료 {c.doneAt}</span>}
      {late && !c.done && <span className="badge bad">약속 시간 넘김</span>}
      {reminder && !c.done && <span className="badge warn">먼저 전화</span>}
      {badges.map(b => <span key={b} className={'badge' + (b === '엘리베이터 없음' ? ' warn' : '')}>{b}</span>)}
    </div>}
    {open && <div className="stop-body">
      <p className="addr-full">{c.addr || '주소 확인 필요'} {c.addr && <button type="button" className="text-btn" onClick={() => actions.copy(c.addr, '주소')}>복사</button>}</p>
      {reminder && <p className="note warn">먼저 전화: {reminder.why.join(', ')}</p>}
      <dl className="facts">{stopFacts(c).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        <div><dt>작업 예상</dt><dd>{workMin(c)}분</dd></div></dl>
      {c.callMemo && <p className="note">통화 메모: {c.callMemo}</p>}
      <div className="big-actions">
        <a className="btn primary" href={tmap(c.addr)}><NaviIcon/>T맵 길안내</a>
        <button type="button" className={'btn' + (c.done ? '' : ' ok')} onClick={() => actions.update(c.id, {done: !c.done, doneAt: !c.done ? new Date().toTimeString().slice(0, 5) : ''})}>{c.done ? '완료 취소' : '배송 완료'}</button>
      </div>
      <div className="phones">
        {c.phone && <a className="btn" href={'tel:' + digits(c.phone)}><PhoneIcon/>{normalizePhone(c.phone)}</a>}
        {c.safePhone && <a className="btn" href={'tel:' + digits(c.safePhone)}><PhoneIcon/>안심 {normalizePhone(c.safePhone)}</a>}
        {c.phone2 && <a className="btn" href={'tel:' + digits(c.phone2)}><PhoneIcon/>2차 {normalizePhone(c.phone2)}</a>}
      </div>
      <div className="row-actions">
        <button type="button" disabled={index === 0} onClick={() => actions.move(index, index - 1)}>▲ 앞으로</button>
        <button type="button" disabled={index === count - 1} onClick={() => actions.move(index, index + 1)}>▼ 뒤로</button>
        <label className="pick"><span>순서</span><select value={index} onChange={e => actions.move(index, +e.target.value)} aria-label="몇 번째로 옮길지 고르기">{Array.from({length: count}, (_, i) => <option key={i} value={i}>{i + 1}번째</option>)}</select></label>
        <button type="button" onClick={() => actions.openDocument(c)}>출고표</button>
      </div>
      <details className="sub">
        <summary>시간 약속 바꾸기 · 고객 수정</summary>
        <div className="sub-body">
          <label className="field"><span>약속 시간대</span><select value={c.slot} onChange={e => actions.update(c.id, {slot: e.target.value, promiseTime: ''})}><option value="am">오전 9~13시</option><option value="pm">오후 13~17시</option><option value="any">시간 상관없음</option></select></label>
          <label className="field"><span>정확한 약속 시각</span><input type="time" value={c.promiseTime || ''} onChange={e => actions.update(c.id, {promiseTime: e.target.value})}/></label>
          <label className="field"><span>통화 메모</span><textarea value={c.callMemo || ''} onChange={e => actions.update(c.id, {callMemo: e.target.value})}/></label>
          <div className="row-actions">
            <button type="button" onClick={() => actions.edit(c)}>고객 정보 수정</button>
            <button type="button" className="danger" onClick={() => {if (confirm((c.name || '이 고객') + '을(를) 코스에서 뺄까요?')) actions.remove(c.id)}}>코스에서 빼기</button>
          </div>
        </div>
      </details>
    </div>}
  </article>;
}

export default function RouteView(props) {
  const {day, history, calc, calls, legBusy, aiBusy, tmapReady, legsReady, actions} = props;
  const [openId, setOpenId] = useState(null);
  const [armed, setArmed] = useState(false);
  const totals = routeTotals(day);
  const [drag, setDragState] = useState(null); // {from, to}
  const dragRef = useRef(null);
  const setDrag = next => {dragRef.current = typeof next === 'function' ? next(dragRef.current) : next; setDragState(dragRef.current)};
  const pointerY = useRef(null);
  useEffect(() => {
    if (!drag) return;
    let frame;
    const tick = () => {
      const p = pointerY.current;
      if (p) {
        const y = p.y;
        if (y < 110) window.scrollBy(0, -Math.ceil((110 - y) / 6));
        else if (y > window.innerHeight - 150) window.scrollBy(0, Math.ceil((y - window.innerHeight + 150) / 6));
        const to = targetAt(p.x, y);
        if (to != null) setDrag(d => d && d.to !== to ? {...d, to} : d);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.body.classList.add('dragging-route');
    return () => {cancelAnimationFrame(frame); document.body.classList.remove('dragging-route')};
  }, [!!drag]);
  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-idx]');
    return el ? +el.dataset.idx : null;
  };
  const grip = i => ({
    onPointerDown: e => {e.preventDefault(); try {e.currentTarget.setPointerCapture(e.pointerId)} catch {} pointerY.current = {x: e.clientX, y: e.clientY}; setDrag({from: i, to: i})},
    onPointerMove: e => {const d = dragRef.current; if (!d) return; pointerY.current = {x: e.clientX, y: e.clientY}; const to = targetAt(e.clientX, e.clientY); if (to != null && to !== d.to) setDrag({...d, to})},
    onPointerUp: e => {const d = dragRef.current; if (d) {const to = targetAt(e.clientX, e.clientY) ?? d.to; if (to !== d.from) actions.move(d.from, to)} setDrag(null); pointerY.current = null},
    onPointerCancel: () => {setDrag(null); pointerY.current = null},
    onKeyDown: e => {if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {e.preventDefault(); actions.move(i, i + (e.key === 'ArrowUp' ? -1 : 1))}},
  });
  const done = day.list.filter(c => c.done).length;
  const needCheck = day.list.some(c => c.verified === false);

  return <section className="view"><div className="wrap">
    <WeekStrip day={day} history={history} onOpenDay={actions.openDay}/>

    {day.list.length === 0 ? <div className="empty">
      <p>이 날짜에는 배송이 없어요.</p>
      <button type="button" className="btn primary" onClick={() => actions.switchTab('add')}>출고표 사진 넣기</button>
    </div> : <>
      <div className="overview">
        <div><span>배송</span><strong>{day.list.length}곳{done > 0 && <small> · {done}곳 완료</small>}</strong></div>
        <div><span>귀가 예상</span><strong>{fmt(calc.home)}</strong></div>
        <div><span>총 운전</span><strong>{legsReady ? fmtDuration(totals.min) : '-'}</strong></div>
      </div>
      {!tmapReady && <p className="note">이동 시간을 보려면 지도 탭에서 T맵을 연결하세요. <button type="button" className="text-btn" onClick={() => actions.switchTab('map')}>연결하기</button></p>}
      {tmapReady && !legsReady && !legBusy && <p className="note">이동 시간을 받지 못했어요. <button type="button" className="text-btn" onClick={actions.fetchLegs}>다시 받기</button></p>}
      {needCheck && <p className="note warn">사진에서 읽은 정보 중 확인할 게 있어요.</p>}

      {calls.length > 0 && <details className="calls">
        <summary>먼저 전화할 곳 {calls.length}곳</summary>
        <ul>{calls.map(x => {const p = x.c.phone || x.c.safePhone; return <li key={x.c.id}>
          <div><strong>{x.i + 1}. {x.c.name || '고객'}</strong><span>{x.why.join(', ')}</span></div>
          {p && <a className="round" href={'tel:' + digits(p)} aria-label={(x.c.name || '고객') + ' 전화'}><PhoneIcon/></a>}
        </li>})}</ul>
      </details>}

      {drag && <p className="drag-hint" role="status">{drag.from + 1}번 {day.list[drag.from]?.name} → {drag.to + 1}번째 자리로</p>}
      <ol className="timeline">
        <li className="tl-end"><time>{day.depart}</time><div><strong>출발</strong><span>{day.start}</span></div></li>
        {calc.rows.map((row, i) => <React.Fragment key={row.c.id}>
          <li className="tl-leg"><Leg day={day} i={i} busy={legBusy}/></li>
          <li className="tl-stop" data-idx={i}>
            <time className={row.flags.some(([k]) => k === 'bad') && !row.c.done ? 'late' : ''}>{row.c.done && row.c.doneAt ? row.c.doneAt : fmt(row.start)}</time>
            <StopCard row={row} index={i} count={day.list.length} open={openId === row.c.id} onToggle={() => setOpenId(openId === row.c.id ? null : row.c.id)} reminder={calls.find(x => x.c.id === row.c.id)} actions={actions} grip={grip(i)} dragging={drag?.from === i} target={drag && drag.to === i && drag.from !== i}/>
          </li>
        </React.Fragment>)}
        <li className="tl-leg"><Leg day={day} i={day.list.length} busy={legBusy}/></li>
        <li className="tl-end"><time>{fmt(calc.home)}</time><div><strong>귀가</strong><span>{day.end}</span></div></li>
      </ol>

      <div className="bottom-actions">
        <button type="button" className="btn" disabled={aiBusy} onClick={actions.runAI}>{aiBusy ? '순서 짜는 중…' : '순서 다시 짜기'}</button>
        <button type="button" className="btn" onClick={() => actions.copy(actions.courseText(), '코스 전체')}>코스 복사</button>
      </div>
      {legsReady && <p className="note center">총 {totals.km}km · 운전 {fmtDuration(totals.min)} · 출발부터 귀가까지 {fmtDuration(calc.home - toMin(day.depart))}</p>}
    </>}

    <details className="settings">
      <summary>설정</summary>
      <div className="sub-body">
        <p className="note">이동 시간은 T맵 화물차 경로 기준이에요. 실제 도로 사정은 운전 중 T맵에서 확인하세요.</p>
        {tmapReady && day.list.length > 0 && <button type="button" className="btn" disabled={legBusy} onClick={actions.fetchLegs}>이동 시간 새로 받기</button>}
        <button type="button" className="btn" onClick={actions.aiSettings}>{actions.aiKey ? '자동 순서(AI) 키 변경' : '자동 순서(AI) 연결'}</button>
        {actions.aiKey && <button type="button" className="btn" onClick={actions.forgetAI}>자동 순서(AI) 키 지우기</button>}
        {day.list.length > 0 && <button type="button" className={'btn danger' + (armed ? ' armed' : '')} onClick={() => {if (!armed) {setArmed(true); setTimeout(() => setArmed(false), 4000); return} actions.clearDay(); setArmed(false)}}>{armed ? '한 번 더 누르면 이 날짜를 비워요' : '이 날짜 비우기'}</button>}
      </div>
    </details>
  </div></section>;
}
