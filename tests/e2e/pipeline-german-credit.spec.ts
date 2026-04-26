import { expect, test, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "url";

const THIRTY_FIVE_MINUTES = 35 * 60 * 1000;

test.setTimeout(THIRTY_FIVE_MINUTES);
test.describe.configure({ mode: "serial" });

const DATASET_PATH = fileURLToPath(
  new URL(
    "../../services/data/Statlog_German_Credit_Data.csv",
    import.meta.url,
  ),
);

const SENSITIVE_COLUMNS = [
  "checking_account_status",
  "credit_history",
  "credit_amount",
  "savings_account",
] as const;

const METHODS = [
  "Байесовские сети",
  // "TVAE",
  // "TGAN",
  // "CTGAN",
  // "DPGAN",
  // "TabDDPM",
  // "Forest-VP",
  // "GREAT",
] as const;

const COLUMN_CONSTRAINTS: Record<string, Record<string, string | boolean>> = {
  checking_account_status: {
    postprocessAllowedValues:
      "< 0 DM, 0 ≤ … < 200 DM, ≥ 200 DM, no checking account",
  },
  duration: {
    postprocessMinValue: "4",
    postprocessMaxValue: "72",
    postprocessIntegerOnly: true,
  },
  credit_history: {
    postprocessAllowedValues:
      "critical account / other credits existing, existing credits paid back duly till now, delay in paying off in the past, no credits taken / all paid back duly, all credits paid back at this bank",
  },
  purpose: {
    postprocessAllowedValues:
      "radio/TV, education, furniture/equipment, car (new), car (used), business, domestic appliances, repairs, others, retraining",
  },
  credit_amount: {
    postprocessMinValue: "250",
    postprocessMaxValue: "18424",
    postprocessIntegerOnly: true,
  },
  savings_account: {
    postprocessAllowedValues:
      "unknown / no savings account, < 100 DM, 100 ≤ … < 500 DM, 500 ≤ … < 1000 DM, ≥ 1000 DM",
  },
  employment_duration: {
    postprocessAllowedValues:
      "unemployed, < 1 year, 1 ≤ … < 4 years, 4 ≤ … < 7 years, ≥ 7 years",
  },
  installment_rate: {
    postprocessMinValue: "1",
    postprocessMaxValue: "4",
    postprocessIntegerOnly: true,
  },
  personal_status_sex: {
    postprocessAllowedValues:
      "male (single), female (divorced/separated/married), male (divorced/separated), male (married/widowed)",
  },
  other_debtors: {
    postprocessAllowedValues: "none, guarantor, co-applicant",
  },
  present_residence: {
    postprocessMinValue: "1",
    postprocessMaxValue: "4",
    postprocessIntegerOnly: true,
  },
  property: {
    postprocessAllowedValues:
      "real estate, building society savings / life insurance, car or other, unknown / no property",
  },
  age: {
    postprocessMinValue: "19",
    postprocessMaxValue: "75",
    postprocessIntegerOnly: true,
  },
  other_installment_plans: {
    postprocessAllowedValues: "none, bank, stores",
  },
  housing: {
    postprocessAllowedValues: "own, for free, rent",
  },
  number_credits: {
    postprocessMinValue: "1",
    postprocessMaxValue: "4",
    postprocessIntegerOnly: true,
  },
  job: {
    postprocessAllowedValues:
      "skilled employee, unskilled resident, management / highly qualified / self-employed / officer, unemployed / unskilled non-resident",
  },
  people_liable: {
    postprocessMinValue: "1",
    postprocessMaxValue: "2",
    postprocessIntegerOnly: true,
  },
  telephone: {
    postprocessAllowedValues: "yes, none",
  },
  foreign_worker: {
    postprocessAllowedValues: "yes, no",
  },
  "credit risk": {
    postprocessAllowedValues: "good, bad",
  },
};

function formFieldByLabel(page: Page, label: string): Locator {
  return page.locator("div.space-y-2", {
    has: page.locator(`label:text-is("${label}")`),
  });
}

async function chooseOption(
  page: Page,
  label: string,
  option: string,
): Promise<void> {
  const field = formFieldByLabel(page, label);

  await field.getByRole("combobox").click({
    timeout: THIRTY_FIVE_MINUTES,
  });

  await page.getByRole("option", { name: option, exact: true }).click({
    timeout: THIRTY_FIVE_MINUTES,
  });
}

async function fillInputByLabel(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const field = formFieldByLabel(page, label);
  const input = field.locator("input");

  await input.fill(value, {
    timeout: THIRTY_FIVE_MINUTES,
  });
}

async function setCheckboxByLabel(
  page: Page,
  label: string,
  targetState: boolean,
): Promise<void> {
  const checkbox = page
    .locator("label", { hasText: label })
    .locator('input[type="checkbox"]');

  await expect(checkbox).toBeVisible({
    timeout: THIRTY_FIVE_MINUTES,
  });

  if ((await checkbox.isChecked()) !== targetState) {
    await checkbox.click({
      timeout: THIRTY_FIVE_MINUTES,
    });
  }
}

async function selectColumn(page: Page, columnName: string): Promise<void> {
  const columnHeader = page.locator("th", { hasText: columnName }).first();

  await expect(columnHeader).toBeVisible({
    timeout: THIRTY_FIVE_MINUTES,
  });

  await columnHeader.click({
    timeout: THIRTY_FIVE_MINUTES,
  });
}

async function clickNext(
  page: Page,
  timeout = THIRTY_FIVE_MINUTES,
): Promise<void> {
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Далее" }).click({
    timeout,
  });
}

async function setupPreprocessing(page: Page): Promise<void> {
  for (const columnName of SENSITIVE_COLUMNS) {
    await selectColumn(page, columnName);
    await chooseOption(page, "Тип признака", "Чувствительный идентификатор");
  }

  await selectColumn(page, "credit risk");
  await chooseOption(page, "Роль", "Целевой признак");

  await clickNext(page);
}

async function setupGeneration(page: Page, method: string): Promise<void> {
  const methodSelect = page
    .getByRole("combobox")
    .filter({ hasText: "Выберите метод" });

  await expect(methodSelect).toBeVisible({ timeout: THIRTY_FIVE_MINUTES });
  await expect(methodSelect).toBeEnabled({ timeout: THIRTY_FIVE_MINUTES });

  await methodSelect.click({ timeout: THIRTY_FIVE_MINUTES });

  const option = page.getByRole("option").filter({ hasText: method }).first();

  await expect(option).toBeVisible({ timeout: THIRTY_FIVE_MINUTES });
  await option.click({ timeout: THIRTY_FIVE_MINUTES });

  await expect(methodSelect).toContainText(method, {
    timeout: THIRTY_FIVE_MINUTES,
  });

  await clickNext(page, THIRTY_FIVE_MINUTES);
}

async function setupPostprocessing(page: Page): Promise<void> {
  for (const [columnName, config] of Object.entries(COLUMN_CONSTRAINTS)) {
    await selectColumn(page, columnName);
    await chooseOption(page, "Улучшение качества выборки", "Фильтрация");

    if (typeof config.postprocessAllowedValues === "string") {
      await fillInputByLabel(
        page,
        "Возможные значения",
        config.postprocessAllowedValues,
      );
    }

    if (typeof config.postprocessMinValue === "string") {
      await fillInputByLabel(
        page,
        "Минимальное значение",
        config.postprocessMinValue,
      );
    }

    if (typeof config.postprocessMaxValue === "string") {
      await fillInputByLabel(
        page,
        "Максимальное значение",
        config.postprocessMaxValue,
      );
    }

    if (typeof config.postprocessIntegerOnly === "boolean") {
      await setCheckboxByLabel(
        page,
        "Только целочисленные значения",
        config.postprocessIntegerOnly,
      );
    }
  }

  await clickNext(page);
}

async function runEvaluationAndDownload(page: Page): Promise<void> {
  await clickNext(page, THIRTY_FIVE_MINUTES);

  await expect(page.getByRole("tab", { name: "Результаты" })).toHaveAttribute(
    "data-state",
    "active",
    {
      timeout: THIRTY_FIVE_MINUTES,
    },
  );

  const sourceCsvDownload = page.waitForEvent("download", {
    timeout: THIRTY_FIVE_MINUTES,
  });

  await page.getByRole("button", { name: "Скачать CSV" }).click({
    timeout: THIRTY_FIVE_MINUTES,
  });

  await sourceCsvDownload;

  const evaluationCsvDownload = page.waitForEvent("download", {
    timeout: THIRTY_FIVE_MINUTES,
  });

  await page.getByRole("button", { name: "Скачать оценку CSV" }).click({
    timeout: THIRTY_FIVE_MINUTES,
  });

  await evaluationCsvDownload;
}

for (const method of METHODS) {
  test(`E2E: German Credit pipeline c методом ${method}`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
      timeout: THIRTY_FIVE_MINUTES,
    });

    await page.setInputFiles('input[type="file"]', DATASET_PATH, {
      timeout: THIRTY_FIVE_MINUTES,
    });

    await expect(
      page.locator("th", { hasText: "checking_account_status" }).first(),
    ).toBeVisible({
      timeout: THIRTY_FIVE_MINUTES,
    });

    await setupPreprocessing(page);
    await setupGeneration(page, method);
    await setupPostprocessing(page);
    await runEvaluationAndDownload(page);
  });
}
