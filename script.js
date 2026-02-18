const compareBlock = document.querySelector('[data-compare]');

if (compareBlock) {
  const input = compareBlock.querySelector('.compare-input');
  const afterWrap = compareBlock.querySelector('.compare-after-wrap');
  const line = compareBlock.querySelector('.compare-line');
  const knob = compareBlock.querySelector('.compare-knob');

  const updateCompare = (value) => {
    const ratio = `${value}%`;
    afterWrap.style.width = ratio;
    line.style.left = ratio;
    knob.style.left = ratio;
  };

  updateCompare(input.value);

  input.addEventListener('input', (event) => {
    updateCompare(event.target.value);
  });
}

const heroCopy = document.querySelector('.hero-copy');
const heroMedia = document.querySelector('.hero-media');

if (heroCopy && heroMedia) {
  const syncHeroColumns = () => {
    if (window.innerWidth <= 1180) {
      heroMedia.style.height = '';
      return;
    }

    heroMedia.style.height = `${heroCopy.offsetHeight}px`;
  };

  syncHeroColumns();
  window.addEventListener('resize', syncHeroColumns);

  if ('ResizeObserver' in window) {
    const heroObserver = new ResizeObserver(syncHeroColumns);
    heroObserver.observe(heroCopy);
  }
}

const priceTable = document.querySelector('.price-table');
const servicesTableBody = document.querySelector('[data-services-body]');
const servicesSelect = document.querySelector('[data-service-select]');
const servicesStatus = document.getElementById('services-status');

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
  if (!servicesTableBody || !servicesSelect) {
    return;
  }

  servicesTableBody.innerHTML = '';
  servicesSelect.innerHTML = '<option value="" selected disabled>Выберите услугу</option>';

  services.forEach((service) => {
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

    const option = document.createElement('option');
    option.value = service.name;
    option.textContent = service.name;
    servicesSelect.appendChild(option);
  });

  applyPriceTableLabels();
};

const loadServicesFromDatabase = async () => {
  if (!servicesTableBody || !servicesSelect) {
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
      servicesTableBody.innerHTML = '<tr><td colspan="4">Активных услуг пока нет.</td></tr>';
      servicesSelect.innerHTML = '<option value="" selected disabled>Активных услуг пока нет</option>';
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

const navLinks = document.querySelectorAll('.main-nav a');
const sections = Array.from(navLinks)
  .map((link) => document.querySelector(link.getAttribute('href')))
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
      car: String(formData.get('car') || '').trim(),
      service: String(formData.get('service') || '').trim(),
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
