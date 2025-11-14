export function ProjectsSidebar() {
  return (
    <nav className="p-6">
      <p className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Projects
      </p>
      <ul className="space-y-2 text-sm font-medium text-gray-700">
        <li className="rounded-lg px-3 py-2 transition hover:bg-gray-100">
          Overview
        </li>
        <li className="rounded-lg px-3 py-2 transition hover:bg-gray-100">
          Active Projects
        </li>
        <li className="rounded-lg px-3 py-2 transition hover:bg-gray-100">
          Archived Projects
        </li>
        <li className="rounded-lg px-3 py-2 transition hover:bg-gray-100">
          Team Boards
        </li>
        <li className="rounded-lg px-3 py-2 transition hover:bg-gray-100">
          Reports
        </li>
      </ul>
    </nav>
  );
}
