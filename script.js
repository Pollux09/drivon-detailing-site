const compareBlock = document.querySelector('[data-compare]');
const heroVideo = document.querySelector('.hero-bg-video');

if (heroVideo instanceof HTMLVideoElement) {
  heroVideo.autoplay = true;
  heroVideo.loop = true;
  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.playsInline = true;
  heroVideo.setAttribute('muted', '');
  heroVideo.setAttribute('playsinline', '');
  heroVideo.setAttribute('webkit-playsinline', '');

  const tryPlayHero = () => {
    const playPromise = heroVideo.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  };

  if (heroVideo.readyState >= 2) {
    tryPlayHero();
  } else {
    heroVideo.addEventListener('loadeddata', tryPlayHero, { once: true });
  }

  window.addEventListener('pointerdown', tryPlayHero, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tryPlayHero();
    }
  });
}

if (compareBlock) {
  const input = compareBlock.querySelector('.compare-input');
  const afterWrap = compareBlock.querySelector('.compare-after-wrap');
  const line = compareBlock.querySelector('.compare-line');
  const knob = compareBlock.querySelector('.compare-knob');

  const updateCompare = (value) => {
    const numericValue = Math.max(0, Math.min(100, Number(value)));
    const ratio = `${numericValue}%`;
    afterWrap.style.clipPath = `inset(0 ${100 - numericValue}% 0 0)`;
    line.style.left = ratio;
    knob.style.left = ratio;
  };

  updateCompare(input.value);

  input.addEventListener('input', (event) => {
    updateCompare(event.target.value);
  });
}

const routeCarousel = document.querySelector('[data-route-carousel]');

if (routeCarousel) {
  const track = routeCarousel.querySelector('[data-route-track]');
  const prevButton = routeCarousel.querySelector('[data-route-prev]');
  const nextButton = routeCarousel.querySelector('[data-route-next]');
  const dotsContainer = routeCarousel.querySelector('[data-route-dots]');
  const slides = Array.from(track?.querySelectorAll('.route-slide') || []);

  if (track && prevButton && nextButton && dotsContainer && slides.length > 0) {
    let activeIndex = 0;

    const goTo = (index) => {
      activeIndex = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${activeIndex * 100}%)`;

      const dots = dotsContainer.querySelectorAll('.route-dot');
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === activeIndex);
      });
    };

    slides.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'route-dot';
      dot.setAttribute('aria-label', `Фото ${index + 1}`);
      dot.addEventListener('click', () => goTo(index));
      dotsContainer.appendChild(dot);
    });

    prevButton.addEventListener('click', () => goTo(activeIndex - 1));
    nextButton.addEventListener('click', () => goTo(activeIndex + 1));

    goTo(0);
  }
}

const priceTable = document.querySelector('.price-table');
const servicesTableBody = document.querySelector('[data-services-body]');
const servicesSelect = document.querySelector('[data-service-select]');
const servicesStatus = document.getElementById('services-status');
const hasServicesTable = servicesTableBody instanceof HTMLElement;
const hasServicesSelect = servicesSelect instanceof HTMLSelectElement;

const applyPriceTableLabels = () => {
  if (!priceTable) {
    return;
  }
  const headers = Array.from(priceTable.querySelectorAll('thead th')).map((th) =>
    th.textContent.trim()
  );

  const rows = priceTable.querySelectorAll('tbody tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    cells.forEach((cell, index) => {
      if (!cell.hasAttribute('data-label')) {
        cell.setAttribute('data-label', headers[index] || '');
      }
    });
  });
};

const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours > 0 && restMinutes > 0) {
    return `${hours} ч ${restMinutes} мин`;
  }
  if (hours > 0) {
    return `${hours} ч`;
  }
  return `${restMinutes} мин`;
};

const formatPrice = (basePrice) => {
  const value = Number(basePrice);
  if (!Number.isFinite(value)) {
    return `${basePrice} ₽`;
  }
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ₽`;
};

const renderServices = (services) => {
  if (!hasServicesTable && !hasServicesSelect) {
    return;
  }

  if (hasServicesTable) {
    servicesTableBody.innerHTML = '';
  }
  if (hasServicesSelect) {
    servicesSelect.innerHTML = '<option value="" selected disabled>Выберите услугу</option>';
  }

  services.forEach((service) => {
    if (hasServicesTable) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = service.name;

      const descriptionCell = document.createElement('td');
      descriptionCell.textContent = service.description || '—';

      const durationCell = document.createElement('td');
      durationCell.textContent = formatDuration(service.durationMinutes);

      const priceCell = document.createElement('td');
      priceCell.textContent = formatPrice(service.basePrice);

      row.append(nameCell, descriptionCell, durationCell, priceCell);
      servicesTableBody.appendChild(row);
    }

    if (hasServicesSelect) {
      const option = document.createElement('option');
      option.value = service.name;
      option.textContent = service.name;
      servicesSelect.appendChild(option);
    }
  });

  if (hasServicesTable) {
    applyPriceTableLabels();
  }
};

const loadServicesFromDatabase = async () => {
  if (!hasServicesTable && !hasServicesSelect) {
    return;
  }

  try {
    const response = await fetch('/api/services');
    const body = await response.json();
    if (!response.ok || !body?.ok || !Array.isArray(body.services)) {
      throw new Error('services_load_failed');
    }

    const services = body.services
      .map((service) => ({
        name: String(service?.name || '').trim(),
        description: String(service?.description || '').trim(),
        durationMinutes: Number(service?.duration_minutes || 0),
        basePrice: String(service?.base_price || '').trim(),
      }))
      .filter((service) => service.name.length > 0);

    if (services.length === 0) {
      if (hasServicesTable) {
        servicesTableBody.innerHTML = '<tr><td colspan="4">Активных услуг пока нет.</td></tr>';
      }
      if (hasServicesSelect) {
        servicesSelect.innerHTML = '<option value="" selected disabled>Активных услуг пока нет</option>';
      }
    } else {
      renderServices(services);
    }

    if (servicesStatus) {
      servicesStatus.textContent = '';
      servicesStatus.style.color = '';
    }
  } catch (error) {
    if (servicesStatus) {
      servicesStatus.textContent = 'Не удалось загрузить актуальные услуги из базы. Показан резервный список.';
      servicesStatus.style.color = '#ef8f8f';
    }
  }
};

applyPriceTableLabels();
void loadServicesFromDatabase();

const yandexReviewsContainer = document.querySelector('[data-yandex-reviews]');
const yandexReviewsStatus = document.getElementById('reviews-status');

const formatReviewDate = (isoValue) => {
  if (!isoValue) {
    return '';
  }
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('ru-RU').format(date);
};

const getReviewInitials = (fullName) => {
  const words = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return 'YA';
  }
  const first = words[0]?.[0] || '';
  const second = words[1]?.[0] || '';
  return `${first}${second || ''}`.toUpperCase();
};

const buildStars = (rating) => {
  const normalized = Number.isFinite(Number(rating)) ? Number(rating) : 0;
  const rounded = Math.max(0, Math.min(5, Math.round(normalized)));
  return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
};

const renderYandexReviews = (reviews) => {
  if (!(yandexReviewsContainer instanceof HTMLElement)) {
    return;
  }

  yandexReviewsContainer.innerHTML = '';

  reviews.forEach((review) => {
    const card = document.createElement('article');
    card.className = 'panel review-card review-card-yandex';

    const head = document.createElement('div');
    head.className = 'review-head';

    const avatar = document.createElement('span');
    avatar.className = 'review-avatar';
    avatar.textContent = getReviewInitials(review.author_name);

    const meta = document.createElement('div');
    meta.className = 'review-meta';

    const title = document.createElement('h3');
    title.textContent = String(review.author_name || 'Клиент');

    const subtitle = document.createElement('p');
    const dateLabel = formatReviewDate(String(review.updated_at || ''));
    subtitle.textContent = dateLabel ? `${dateLabel} • Яндекс Карты` : 'Яндекс Карты';

    meta.append(title, subtitle);
    head.append(avatar, meta);

    const stars = document.createElement('p');
    stars.className = 'review-stars';
    stars.textContent = buildStars(review.rating);

    const text = document.createElement('p');
    text.className = 'review-text';
    text.textContent = String(review.text || '');

    const foot = document.createElement('p');
    foot.className = 'review-foot';
    foot.textContent = 'Яндекс Карты';

    card.append(head, stars, text, foot);
    yandexReviewsContainer.appendChild(card);
  });
};

const loadYandexReviews = async () => {
  if (!(yandexReviewsContainer instanceof HTMLElement)) {
    return;
  }

  try {
    const response = await fetch('/api/reviews');
    const body = await response.json();
    if (!response.ok || !body?.ok || !Array.isArray(body.reviews)) {
      throw new Error(body?.error || 'reviews_load_failed');
    }

    const reviews = body.reviews
      .filter((review) => typeof review?.text === 'string' && String(review.text).trim().length > 0)
      .slice(0, 6);

    if (reviews.length === 0) {
      yandexReviewsContainer.innerHTML = '';
      if (yandexReviewsStatus) {
        yandexReviewsStatus.textContent = 'На Яндекс Картах пока нет опубликованных отзывов.';
        yandexReviewsStatus.style.color = '#afbdd5';
      }
      return;
    }

    renderYandexReviews(reviews);
    if (yandexReviewsStatus) {
      yandexReviewsStatus.textContent = '';
      yandexReviewsStatus.style.color = '';
    }
  } catch (error) {
    yandexReviewsContainer.innerHTML = '';
    if (yandexReviewsStatus) {
      yandexReviewsStatus.textContent = 'Не удалось загрузить отзывы с Яндекс Карт. Откройте ссылку «Смотреть все».';
      yandexReviewsStatus.style.color = '#ef8f8f';
    }
  }
};

void loadYandexReviews();

const navLinks = document.querySelectorAll('.main-nav a');
const sections = Array.from(navLinks)
  .map((link) => link.getAttribute('href') || '')
  .filter((href) => href.startsWith('#'))
  .map((href) => document.querySelector(href))
  .filter((section) => section instanceof HTMLElement);

const setActiveLink = (id) => {
  navLinks.forEach((link) => {
    const active = link.getAttribute('href') === `#${id}`;
    link.classList.toggle('is-active', active);
  });
};

if (sections.length > 0) {
  setActiveLink(sections[0].id);

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visible[0]) {
        setActiveLink(visible[0].target.id);
      }
    },
    {
      threshold: [0.3, 0.5, 0.7],
      rootMargin: '-20% 0px -45% 0px',
    }
  );

  sections.forEach((section) => observer.observe(section));
}

const currentPath = window.location.pathname.replace(/\/+$/, '');
Array.from(navLinks).forEach((link) => {
  const href = link.getAttribute('href') || '';
  if (!href || href.startsWith('#')) {
    return;
  }

  const linkPath = href.split('#')[0];
  const normalizedLinkPath = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
  if (currentPath.endsWith(normalizedLinkPath)) {
    link.classList.add('is-active');
  }
});

const requestForm = document.getElementById('request-form');
const message = document.getElementById('form-message');
const TELEGRAM_BOT_URL = 'https://t.me/drivon_detailing_bot';

if (requestForm && message) {
  const setStatusMessage = (text, color) => {
    message.textContent = text;
    message.style.color = color;
  };

  const showFallbackTelegramMessage = () => {
    message.textContent = 'Не удалось отправить заявку с сайта. ';
    const tgLink = document.createElement('a');
    tgLink.href = TELEGRAM_BOT_URL;
    tgLink.target = '_blank';
    tgLink.rel = 'noopener noreferrer';
    tgLink.textContent = 'Написать в Telegram-бот';
    tgLink.style.color = '#9cc7ff';
    tgLink.style.textDecoration = 'underline';
    message.appendChild(tgLink);
    message.appendChild(document.createTextNode('.'));
    message.style.color = '#ef8f8f';
  };

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!requestForm.checkValidity()) {
      requestForm.reportValidity();
      setStatusMessage('Проверьте поля формы перед отправкой.', '#ef8f8f');
      return;
    }

    const button = requestForm.querySelector('.submit-btn');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    button.textContent = 'Отправка...';
    message.textContent = '';
    message.style.color = '';

    const formData = new FormData(requestForm);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      comment: String(formData.get('comment') || '').trim(),
    };

    try {
      const response = await fetch('/api/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch (parseError) {
        body = null;
      }

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || 'request_failed');
      }

      requestForm.reset();
      setStatusMessage('Заявка отправлена. Администратор свяжется с вами в ближайшее время.', '#79e789');
    } catch (error) {
      showFallbackTelegramMessage();
    } finally {
      button.disabled = false;
      button.textContent = 'Отправить заявку';
    }
  });
}
