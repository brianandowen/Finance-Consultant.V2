// src/utils/reply.ts
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";

export async function replyOnce(
  interaction: ChatInputCommandInteraction,
  content: string,
  { ephemeral = false }: { ephemeral?: boolean } = {}
) {
  const opts = { content, flags: ephemeral ? MessageFlags.Ephemeral : undefined as any };

  if (!interaction.deferred && !interaction.replied) return interaction.reply(opts as any);
  if (interaction.deferred && !interaction.replied) return interaction.editReply(content);
  return interaction.followUp(opts as any);
}
