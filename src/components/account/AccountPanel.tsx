// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { useProvider } from "../../hooks/useProvider";
import type { AnthropicUsage, OpenaiUsage } from "../../types/account";
import { AnthropicCard } from "./AnthropicCard";
import { OpenAICard } from "./OpenAICard";
import { CursorCard } from "./CursorCard";

export function AccountPanel() {
  const anthropic = useProvider<AnthropicUsage>("anthropic-usage");
  const openai = useProvider<OpenaiUsage>("openai-usage");
  return (
    <div className="flex flex-col gap-control pad-card">
      <AnthropicCard data={anthropic} />
      <OpenAICard data={openai} />
      <CursorCard />
    </div>
  );
}
