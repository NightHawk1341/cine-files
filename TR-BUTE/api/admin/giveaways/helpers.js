/**
 * Shared helpers for giveaway message formatting.
 * Used by both the HTTP API (index.js) and the admin bot (/post, /giveaway commands).
 */

function buildGiveawayPost(giveaway) {
  let text = `🎁 <b>${giveaway.title}</b>`;
  if (giveaway.description) text += `\n\n${giveaway.description}`;
  if (giveaway.prizes) text += `\n\n🏆 <b>Призы:</b> ${giveaway.prizes}`;
  text += `\n\n👥 Победителей: ${giveaway.winner_count}`;
  const endDate = new Date(giveaway.end_time).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
  });
  text += `\n⏰ Розыгрыш: ${endDate} МСК`;
  return text;
}

function buildParticipateButton(giveawayId) {
  return { inline_keyboard: [[{ text: '🎉 Участвовать', callback_data: `giveaway_join:${giveawayId}` }]] };
}

module.exports = { buildGiveawayPost, buildParticipateButton };
