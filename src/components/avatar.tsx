/** รูปโปรไฟล์ หรือตัวอักษรแรกของชื่อถ้ายังไม่มีรูป */
export function Avatar({
  user,
  size = 36,
  className = "",
}: {
  user: { id: string; name: string; avatarUpdatedAt?: Date | string | null };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (user.avatarUpdatedAt) {
    const version = new Date(user.avatarUpdatedAt).getTime();
    return (
      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก API ของเราเอง ย่อมาแล้ว ไม่ต้องผ่าน next/image
      <img
        src={`/api/avatar/${user.id}?v=${version}`}
        alt=""
        width={size}
        height={size}
        style={style}
        className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-50 font-bold text-indigo-700 ${className}`}
    >
      {initial(user.name)}
    </span>
  );
}

/** ตัวอักษรแรกของชื่อ — ข้ามสระหน้า (เ แ โ ใ ไ) เพื่อให้ "เอก" ได้ "อ" ไม่ใช่ "เ" */
function initial(name: string) {
  const ch = [...name.trim()].find((c) => !"เแโใไ".includes(c));
  return ch ? ch.toUpperCase() : "?";
}
