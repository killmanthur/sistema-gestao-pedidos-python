const notifySound = new Audio('/static/notification.mp3');

export function playNotificationSound() {
    notifySound.currentTime = 0;
    notifySound.play().catch(e => console.log("Áudio bloqueado pelo browser"));
}
// Remova todo o resto relacionado a Firebase e Chat.