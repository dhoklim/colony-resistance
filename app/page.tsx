import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <header className="site-header shell">
        <Link
          prefetch={false}
          href="/"
          className="brand"
          aria-label="군체 저항도 홈"
        >
          <span className="brand-mark" aria-hidden="true" />
          군체<span className="brand-caption">RESISTANCE PROJECT</span>
        </Link>
        <nav aria-label="메인 메뉴">
          <a href="#about">이벤트 소개</a>
          <a href="#how-to">참여 방법</a>
          <Link prefetch={false} className="nav-entry" href="/participate">
            참여하기 <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <section className="hero shell" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> COLONY : RESISTANCE TEST
          </p>
          <p className="hero-kicker">하나의 의지. 서로 다른 선택.</p>
          <h1 id="hero-heading">
            <span className="title-colony">군체</span>
            <span className="title-sub">
              저항도 테스트<span className="title-dot">.</span>
            </span>
          </h1>
          <p className="hero-description">
            모두가 같은 선택을 할 때,
            <br />
            <strong>당신은 어떤 선택을 하겠습니까?</strong>
          </p>
          <p className="hero-detail">
            10개의 생존 상황. 정답은 없습니다.
            <br />
            당신의 선택이 군체와 얼마나 다른지 확인하세요.
          </p>
          <Link
            prefetch={false}
            href="/participate"
            className="button button-primary hero-cta"
          >
            나의 저항도 알아보기 <span aria-hidden="true">↗</span>
          </Link>
          <p className="cta-note">
            약 3분 소요 <span>·</span> 1인 1회 참여
          </p>
        </div>
        <div
          className="specimen"
          role="img"
          aria-label="연결된 군체의 원형 신호와 그 밖으로 벗어난 하나의 초록빛 점"
        >
          <div className="specimen-top">
            <span>SPECIMEN / 001</span>
            <span className="signal-label">
              <i /> SIGNAL DETECTED
            </span>
          </div>
          <div className="radar">
            <div className="radar-grid" />
            <div className="radar-orbit orbit-one" />
            <div className="radar-orbit orbit-two" />
            <div className="radar-orbit orbit-three" />
            <div className="radar-orbit orbit-four" />
            <div className="radar-cloud cloud-one" />
            <div className="radar-cloud cloud-two" />
            <div className="radar-cloud cloud-three" />
            <div className="radar-core">
              <span>WE ARE</span>
              <strong>
                ONE<span>?</span>
              </strong>
            </div>
            <span className="radar-node node-one" />
            <span className="radar-node node-two" />
            <span className="radar-node node-three" />
            <span className="radar-node node-outside" />
            <span className="outside-label">YOU</span>
            <span className="radar-axis axis-top">N</span>
            <span className="radar-axis axis-bottom">S</span>
            <span className="radar-axis axis-left">W</span>
            <span className="radar-axis axis-right">E</span>
          </div>
          <div className="specimen-bottom">
            <span>
              집단의 바깥에서,
              <br />
              <strong>당신만의 판단을 찾으세요.</strong>
            </span>
            <span className="barcode" aria-hidden="true" />
          </div>
        </div>
      </section>
      <section className="event-facts shell" aria-label="이벤트 요약">
        <div>
          <span className="fact-index">01 / SCENARIOS</span>
          <p>
            <strong>10</strong>개의 생존 상황
          </p>
        </div>
        <div>
          <span className="fact-index">02 / RESISTANCE</span>
          <p>
            최대 <strong>50</strong>점의 저항도
          </p>
        </div>
        <div>
          <span className="fact-index">03 / REWARD</span>
          <p>
            <strong>2</strong>명에게 CGV 관람권
          </p>
        </div>
      </section>
      <section id="about" className="about-section shell">
        <div>
          <p className="eyebrow">THE EXPERIMENT</p>
          <h2>
            연결된 모두.
            <br />
            <span>독립적인 당신.</span>
          </h2>
        </div>
        <div className="about-copy">
          <p>
            영화 〈군체〉 속 감염자들은 서로 연결되어 하나의 의지처럼
            움직입니다. 그렇다면 위기의 순간, 우리의 판단도 같을까요?
          </p>
          <p>
            다수가 고르지 않은 선택일수록 더 높은 <strong>군체 저항도</strong>를
            얻습니다. 다른 사람의 답을 추측하기보다, 당신의 판단을 믿어보세요.
          </p>
        </div>
      </section>
      <section id="how-to" className="how-section shell">
        <p className="eyebrow">HOW TO PARTICIPATE</p>
        <h2>당신의 선택이 실험이 됩니다.</h2>
        <div className="steps">
          <article>
            <span>01</span>
            <h3>상황에 답하기</h3>
            <p>10개의 상황에서 가장 먼저 할 행동을 선택하세요.</p>
          </article>
          <article>
            <span>02</span>
            <h3>군체와 비교하기</h3>
            <p>답변을 제출한 뒤 운영자의 문항별 결과 공개를 기다립니다.</p>
          </article>
          <article>
            <span>03</span>
            <h3>저항도 확인하기</h3>
            <p>운영자가 결과를 공개하면 선택 비율·점수를 확인하고 다음 문항으로 진행합니다.</p>
          </article>
        </div>
      </section>
      <footer className="site-footer shell">
        <span>
          군체 저항도 <span className="footer-divider">/</span> 참여형 생존 선택
          이벤트
        </span>
        <Link prefetch={false} href="/admin">
          운영자 <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </main>
  );
}
