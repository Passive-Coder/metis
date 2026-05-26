import { createFileRoute } from "@tanstack/react-router";
import {
	Archive,
	ArrowDownUp,
	BadgeDollarSign,
	BarChart3,
	Bell,
	BookOpen,
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Code2,
	Database,
	Flame,
	GraduationCap,
	Hash,
	LibraryBig,
	type LucideIcon,
	Plus,
	Search,
	ShieldCheck,
	Shuffle,
	SlidersHorizontal,
	Sparkles,
	Swords,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

type Difficulty = "Easy" | "Med." | "Hard";
type ProblemStatus = "daily" | "solved" | "todo";
type SortMode = "id" | "title" | "acceptance";

type NavItem = {
	label: string;
	hasChevron?: boolean;
	accent?: boolean;
};

type SidebarItem = {
	label: string;
	icon: LucideIcon;
	badge?: string;
};

type FeatureCard = {
	id: string;
	title: string;
	subtitle: string;
	gradient: string;
	accent: string;
};

type TopicCategory = {
	label: string;
	count: number;
};

type TopicPill = {
	label: string;
	icon: LucideIcon;
	color: string;
};

type Problem = {
	id: number;
	title: string;
	acceptance: number;
	difficulty: Difficulty;
	status: ProblemStatus;
	category: string;
};

type CalendarDay = {
	key: string;
	label: string;
	solved?: boolean;
	selected?: boolean;
};

type CalendarMonth = {
	name: string;
	timer: string;
	days: CalendarDay[];
};

type Company = {
	name: string;
	count: number;
};

type BadgeVariant = {
	name: string;
	color: string;
	fill: string;
	ring: string;
};

const navItems: NavItem[] = [
	{ label: "Problems" },
	{ label: "Contest" },
	{ label: "Discuss" },
	{ label: "Interview", hasChevron: true },
	{ label: "Store", hasChevron: true, accent: true },
];

const sidebarItems: SidebarItem[] = [
	{ label: "Library", icon: LibraryBig },
	{ label: "Quest", icon: Swords, badge: "New" },
	{ label: "Explore", icon: BookOpen },
	{ label: "Study Plan", icon: GraduationCap },
];

const featureCards: FeatureCard[] = [
	{
		id: "mobile",
		title: "LeetCode at Your Fingertips",
		subtitle: "",
		gradient: "linear-gradient(135deg, #01040d 0%, #0b214e 45%, #1b0526 100%)",
		accent: "#ffa116",
	},
	{
		id: "system",
		title: "LeetCode's Interview Crash Course:",
		subtitle: "System Design for Interviews and Beyond",
		gradient: "linear-gradient(135deg, #2a7b56 0%, #2b6749 52%, #122c21 100%)",
		accent: "#a6efbf",
	},
	{
		id: "algo",
		title: "LeetCode's Interview Crash Course:",
		subtitle: "Data Structures and Algorithms",
		gradient: "linear-gradient(135deg, #5c48f5 0%, #7755f8 47%, #9a28db 100%)",
		accent: "#efe9ff",
	},
	{
		id: "top",
		title: "Top Interview Questions",
		subtitle: "Most asked questions for focused practice",
		gradient: "linear-gradient(135deg, #4a98ff 0%, #275fff 52%, #1836c8 100%)",
		accent: "#ffffff",
	},
	{
		id: "sql",
		title: "SQL 50",
		subtitle: "Database questions for interview prep",
		gradient: "linear-gradient(135deg, #17395c 0%, #315f87 46%, #0f2337 100%)",
		accent: "#8fd0ff",
	},
];

const topicCategories: TopicCategory[] = [
	{ label: "Array", count: 2171 },
	{ label: "String", count: 874 },
	{ label: "Hash Table", count: 815 },
	{ label: "Math", count: 678 },
	{ label: "Dynamic Programming", count: 656 },
	{ label: "Sorting", count: 518 },
	{ label: "Greedy", count: 464 },
	{ label: "Binary Search", count: 315 },
	{ label: "Database", count: 274 },
	{ label: "Matrix", count: 268 },
	{ label: "Tree", count: 249 },
	{ label: "Graph", count: 210 },
];

const topicPills: TopicPill[] = [
	{ label: "All Topics", icon: Archive, color: "#262626" },
	{ label: "Algorithms", icon: Hash, color: "#ffa116" },
	{ label: "Database", icon: Database, color: "#2f81f7" },
	{ label: "Shell", icon: BadgeDollarSign, color: "#40c463" },
	{ label: "Concurrency", icon: Shuffle, color: "#a855f7" },
	{ label: "JavaScript", icon: Code2, color: "#38bdf8" },
	{ label: "Pandas", icon: BarChart3, color: "#6d5dfc" },
	{ label: "System Design", icon: SlidersHorizontal, color: "#f97316" },
];

const problems: Problem[] = [
	{
		id: 3120,
		title: "Count the Number of Special Characters I",
		acceptance: 73.7,
		difficulty: "Easy",
		status: "daily",
		category: "String",
	},
	{
		id: 1,
		title: "Two Sum",
		acceptance: 57.5,
		difficulty: "Easy",
		status: "solved",
		category: "Array",
	},
	{
		id: 2,
		title: "Add Two Numbers",
		acceptance: 48.5,
		difficulty: "Med.",
		status: "solved",
		category: "Linked List",
	},
	{
		id: 3,
		title: "Longest Substring Without Repeating Characters",
		acceptance: 39.1,
		difficulty: "Med.",
		status: "solved",
		category: "Hash Table",
	},
	{
		id: 4,
		title: "Median of Two Sorted Arrays",
		acceptance: 46.6,
		difficulty: "Hard",
		status: "solved",
		category: "Binary Search",
	},
	{
		id: 5,
		title: "Longest Palindromic Substring",
		acceptance: 37.9,
		difficulty: "Med.",
		status: "solved",
		category: "Dynamic Programming",
	},
	{
		id: 6,
		title: "Zigzag Conversion",
		acceptance: 54.2,
		difficulty: "Med.",
		status: "todo",
		category: "String",
	},
	{
		id: 7,
		title: "Reverse Integer",
		acceptance: 30.4,
		difficulty: "Med.",
		status: "todo",
		category: "Math",
	},
	{
		id: 8,
		title: "String to Integer (atoi)",
		acceptance: 19.2,
		difficulty: "Med.",
		status: "todo",
		category: "String",
	},
	{
		id: 9,
		title: "Palindrome Number",
		acceptance: 59.5,
		difficulty: "Easy",
		status: "solved",
		category: "Math",
	},
];

const badgeVariants: BadgeVariant[] = [
	{ name: "Gold", color: "#9d7b31", fill: "#342b21", ring: "#f1b33b" },
	{ name: "Emerald", color: "#4bbf72", fill: "#193225", ring: "#94e6ad" },
	{ name: "Blue", color: "#3b82f6", fill: "#18253f", ring: "#8ab5ff" },
	{ name: "Violet", color: "#8b5cf6", fill: "#251d3f", ring: "#c4b5fd" },
];

const calendarMonths: CalendarMonth[] = [
	{
		name: "Day 26",
		timer: "15:00:52 left",
		days: makeCalendarDays(5, 31, 26),
	},
	{
		name: "Day 14",
		timer: "08:42:19 left",
		days: makeCalendarDays(1, 30, 14),
	},
	{
		name: "Day 9",
		timer: "20:13:04 left",
		days: makeCalendarDays(3, 31, 9),
	},
];

const companies: Company[] = [
	{ name: "Google", count: 2278 },
	{ name: "Amazon", count: 1955 },
	{ name: "Uber", count: 366 },
	{ name: "Bloomberg", count: 1189 },
	{ name: "Apple", count: 304 },
	{ name: "Microsoft", count: 1375 },
	{ name: "Meta", count: 926 },
	{ name: "Adobe", count: 641 },
	{ name: "TikTok", count: 388 },
	{ name: "Oracle", count: 512 },
];

const weekDays = [
	{ id: "sun", label: "S" },
	{ id: "mon", label: "M" },
	{ id: "tue", label: "T" },
	{ id: "wed", label: "W" },
	{ id: "thu", label: "T" },
	{ id: "fri", label: "F" },
	{ id: "sat", label: "S" },
];

const lockBars = [
	"bar-a",
	"bar-b",
	"bar-c",
	"bar-d",
	"bar-e",
	"bar-f",
	"bar-g",
	"bar-h",
];

function makeCalendarDays(offset: number, total: number, selected: number) {
	const blanks = Array.from({ length: offset }, (_, index) => ({
		key: `blank-${index}`,
		label: "",
	}));
	const days = Array.from({ length: total }, (_, index) => {
		const day = index + 1;
		return {
			key: `day-${day}`,
			label: String(day),
			selected: day === selected,
			solved: day !== 16 && day <= selected,
		};
	});
	return [...blanks, ...days];
}

function Home() {
	const [activeNav, setActiveNav] = useState("Problems");
	const [activeSidebar, setActiveSidebar] = useState("Library");
	const [featureIndex, setFeatureIndex] = useState(0);
	const [activeCategory, setActiveCategory] = useState("Array");
	const [expandedCategories, setExpandedCategories] = useState(false);
	const [pillStart, setPillStart] = useState(0);
	const [activePill, setActivePill] = useState("All Topics");
	const [query, setQuery] = useState("");
	const [sortMode, setSortMode] = useState<SortMode>("id");
	const [filterOpen, setFilterOpen] = useState(false);
	const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "All">(
		"All",
	);
	const [statusFilter, setStatusFilter] = useState<ProblemStatus | "All">(
		"All",
	);
	const [selectedProblem, setSelectedProblem] = useState(3120);
	const [monthIndex, setMonthIndex] = useState(0);
	const [selectedDay, setSelectedDay] = useState("26");
	const [badgeIndex, setBadgeIndex] = useState(0);
	const [activeWeek, setActiveWeek] = useState("W4");
	const [companyQuery, setCompanyQuery] = useState("");
	const [companyPage, setCompanyPage] = useState(0);

	const visibleProblems = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		const filtered = problems.filter((problem) => {
			const matchesSearch =
				!normalizedQuery ||
				`${problem.id}. ${problem.title}`
					.toLowerCase()
					.includes(normalizedQuery);
			const matchesDifficulty =
				difficultyFilter === "All" || problem.difficulty === difficultyFilter;
			const matchesStatus =
				statusFilter === "All" || problem.status === statusFilter;
			const matchesCategory =
				activePill === "All Topics" ||
				activeCategory === problem.category ||
				activePill === "Algorithms";
			return (
				matchesSearch && matchesDifficulty && matchesStatus && matchesCategory
			);
		});

		return [...filtered].sort((a, b) => {
			if (sortMode === "title") {
				return a.title.localeCompare(b.title);
			}
			if (sortMode === "acceptance") {
				return b.acceptance - a.acceptance;
			}
			return a.id - b.id;
		});
	}, [
		activeCategory,
		activePill,
		difficultyFilter,
		query,
		sortMode,
		statusFilter,
	]);

	const currentCompanies = useMemo(() => {
		const filtered = companies.filter((company) =>
			company.name.toLowerCase().includes(companyQuery.trim().toLowerCase()),
		);
		const start = companyPage * 6;
		return filtered.slice(start, start + 6);
	}, [companyPage, companyQuery]);

	const cycleSort = () => {
		setSortMode((current) =>
			current === "id" ? "title" : current === "title" ? "acceptance" : "id",
		);
	};

	const changeMonth = (direction: -1 | 1) => {
		setMonthIndex((current) => {
			const next =
				(current + direction + calendarMonths.length) % calendarMonths.length;
			const nextSelected =
				calendarMonths[next].days.find((day) => day.selected)?.label || "1";
			setSelectedDay(nextSelected);
			setBadgeIndex((badge) => (badge + 1) % badgeVariants.length);
			return next;
		});
	};

	return (
		<main className="min-h-screen overflow-x-hidden bg-[#121212] text-[#f4f4f4] antialiased">
			<TopNavigation activeNav={activeNav} onSelectNav={setActiveNav} />
			<div className="grid min-h-[calc(100vh-56px)] grid-cols-[256px_minmax(0,1fr)_340px] max-[1050px]:grid-cols-[220px_minmax(0,1fr)] max-[760px]:grid-cols-1">
				<Sidebar active={activeSidebar} onSelect={setActiveSidebar} />
				<section className="min-w-0 border-[#303030] border-l px-6 pt-12 pb-8 max-[760px]:border-l-0 max-[760px]:px-4 max-[760px]:pt-5">
					<FeatureCarousel
						activeIndex={featureIndex}
						onChange={setFeatureIndex}
					/>
					<TopicControls
						activeCategory={activeCategory}
						activePill={activePill}
						expandedCategories={expandedCategories}
						onCategoryChange={setActiveCategory}
						onExpandedChange={setExpandedCategories}
						onPillChange={setActivePill}
						onPillStartChange={setPillStart}
						pillStart={pillStart}
					/>
					<ProblemTable
						difficultyFilter={difficultyFilter}
						filterOpen={filterOpen}
						onDifficultyFilterChange={setDifficultyFilter}
						onFilterOpenChange={setFilterOpen}
						onQueryChange={setQuery}
						onSortChange={cycleSort}
						onStatusFilterChange={setStatusFilter}
						onProblemSelect={setSelectedProblem}
						problems={visibleProblems}
						query={query}
						selectedProblem={selectedProblem}
						sortMode={sortMode}
						statusFilter={statusFilter}
					/>
				</section>
				<aside className="min-w-0 space-y-8 border-[#303030] border-l bg-[#121212] px-5 pt-14 max-[1050px]:hidden">
					<CalendarPanel
						activeWeek={activeWeek}
						badge={badgeVariants[badgeIndex]}
						month={calendarMonths[monthIndex]}
						onDaySelect={(day) => {
							setSelectedDay(day);
							setBadgeIndex((current) => (current + 1) % badgeVariants.length);
						}}
						onMonthChange={changeMonth}
						onWeekChange={setActiveWeek}
						selectedDay={selectedDay}
					/>
					<TrendingCompanies
						companies={currentCompanies}
						onPageChange={(direction) => {
							setCompanyPage((current) => {
								const filteredCount = companies.filter((company) =>
									company.name
										.toLowerCase()
										.includes(companyQuery.trim().toLowerCase()),
								).length;
								const maxPage = Math.max(0, Math.ceil(filteredCount / 6) - 1);
								return Math.min(maxPage, Math.max(0, current + direction));
							});
						}}
						onQueryChange={(value) => {
							setCompanyQuery(value);
							setCompanyPage(0);
						}}
						query={companyQuery}
					/>
				</aside>
			</div>
		</main>
	);
}

function TopNavigation({
	activeNav,
	onSelectNav,
}: {
	activeNav: string;
	onSelectNav: (value: string) => void;
}) {
	return (
		<header className="flex h-14 items-center border-[#343434] border-b bg-[#262626] px-7 max-[760px]:px-4">
			<div className="mr-9 flex min-w-[174px] items-center gap-2.5">
				<LeetCodeLogo />
				<span className="font-semibold text-[19px] text-white tracking-[-0.02em]">
					LeetCode
				</span>
			</div>
			<nav className="flex h-full items-center gap-8 text-[18px] font-semibold text-[#9f9f9f] max-[930px]:hidden">
				{navItems.map((item) => (
					<button
						type="button"
						className={`flex h-full items-center gap-1 border-b-2 transition ${
							activeNav === item.label
								? "border-[#e7e7e7] text-[#f5f5f5]"
								: item.accent
									? "border-transparent text-[#ffa116] hover:text-[#ffb84a]"
									: "border-transparent hover:text-[#e2e2e2]"
						}`}
						key={item.label}
						onClick={() => onSelectNav(item.label)}
					>
						{item.label}
						{item.hasChevron ? <ChevronDown size={16} /> : null}
					</button>
				))}
			</nav>
			<div className="ml-auto flex items-center gap-4">
				<label className="flex h-9 w-[168px] items-center gap-2.5 rounded-full bg-[#363636] px-4 text-[#a6a6a6] max-[760px]:hidden">
					<Search size={18} />
					<input
						className="w-full bg-transparent text-[16px] font-medium outline-none placeholder:text-[#a6a6a6]"
						placeholder="Search"
					/>
				</label>
				<div className="relative text-[#bdbdbd]">
					<Bell size={20} />
					<span className="absolute -top-0.5 right-0 h-1.5 w-1.5 rounded-full bg-[#f15454]" />
				</div>
				<div className="flex items-center gap-1.5 text-[16px] font-semibold text-[#c8c8c8]">
					<Flame size={20} />
					<span>0</span>
				</div>
				<div className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_30%_28%,#e5f7ff,#88b9c9_38%,#2e4856_39%,#eefbff_52%,#17242b_54%)] ring-2 ring-[#363636]" />
				<button
					type="button"
					className="rounded-[9px] bg-[#3a2d1e] px-4 py-2 text-[16px] font-bold text-[#ffa116] transition hover:bg-[#46351f] max-[640px]:hidden"
				>
					Premium
				</button>
			</div>
		</header>
	);
}

function LeetCodeLogo() {
	return (
		<svg
			aria-label="LeetCode logo"
			className="h-8 w-auto shrink-0"
			fill="none"
			viewBox="0 0 95 111"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M68.0063 83.0664C70.5 80.5764 74.5366 80.5829 77.0223 83.0809C79.508 85.579 79.5015 89.6226 77.0078 92.1127L65.9346 103.17C55.7187 113.371 39.06 113.519 28.6718 103.513C28.6117 103.456 23.9861 98.9201 8.72653 83.957C-1.42528 74.0029 -2.43665 58.0749 7.11648 47.8464L24.9282 28.7745C34.4095 18.6219 51.887 17.5122 62.7275 26.2789L78.9048 39.362C81.6444 41.5776 82.0723 45.5985 79.8606 48.3429C77.6488 51.0873 73.635 51.5159 70.8954 49.3003L54.7182 36.2173C49.0488 31.6325 39.1314 32.2622 34.2394 37.5006L16.4274 56.5727C11.7767 61.5522 12.2861 69.574 17.6456 74.8292C28.851 85.8169 37.4869 94.2846 37.4969 94.2942C42.8977 99.496 51.6304 99.4184 56.9331 94.1234L68.0063 83.0664Z"
				fill="#FFA116"
			/>
			<path
				clipRule="evenodd"
				d="M41.1067 72.0014C37.5858 72.0014 34.7314 69.1421 34.7314 65.615C34.7314 62.0879 37.5858 59.2286 41.1067 59.2286H88.1245C91.6454 59.2286 94.4997 62.0879 94.4997 65.615C94.4997 69.1421 91.6454 72.0014 88.1245 72.0014H41.1067Z"
				fill="#B3B3B3"
				fillRule="evenodd"
			/>
			<path
				clipRule="evenodd"
				d="M49.9118 2.02335C52.3173 -0.55232 56.3517 -0.686894 58.9228 1.72277C61.494 4.13244 61.6284 8.17385 59.2229 10.7495L16.4276 56.5729C11.7768 61.552 12.2861 69.5738 17.6453 74.8292L37.4088 94.2091C39.9249 96.6764 39.968 100.72 37.505 103.24C35.042 105.761 31.0056 105.804 28.4895 103.337L8.72593 83.9567C-1.42529 74.0021 -2.43665 58.0741 7.1169 47.8463L49.9118 2.02335Z"
				fill="white"
				fillRule="evenodd"
			/>
		</svg>
	);
}

function Sidebar({
	active,
	onSelect,
}: {
	active: string;
	onSelect: (value: string) => void;
}) {
	return (
		<aside className="bg-[#1a1a1a] px-5 pt-8 max-[760px]:hidden">
			<div className="space-y-2">
				{sidebarItems.map((item) => {
					const Icon = item.icon;
					return (
						<button
							type="button"
							className={`flex h-[43px] w-full items-center gap-3 rounded-md px-3 text-left text-[18px] font-bold transition ${
								active === item.label
									? "bg-[#2b2b2b] text-white"
									: "text-[#eeeeee] hover:bg-[#242424]"
							}`}
							key={item.label}
							onClick={() => onSelect(item.label)}
						>
							<Icon size={23} strokeWidth={2.3} />
							<span>{item.label}</span>
							{item.badge ? (
								<span className="ml-auto rounded-full bg-[#2f70f7] px-3 py-0.5 text-[12px] font-bold text-white">
									{item.badge}
								</span>
							) : null}
						</button>
					);
				})}
			</div>
			<div className="mt-[170px] border-[#303030] border-t pt-5">
				<div className="mb-5 flex items-center justify-between text-[#a8a8a8]">
					<h2 className="font-bold text-[17px]">My Lists</h2>
					<div className="flex items-center gap-3">
						<button type="button">
							<Plus size={20} />
						</button>
						<button type="button">
							<ChevronDown size={16} />
						</button>
					</div>
				</div>
				<button
					type="button"
					className="flex w-full items-center gap-3 text-left text-[16px] font-bold text-[#eeeeee]"
				>
					<span className="grid h-6 w-6 place-items-center rounded bg-[#f7f7f7] text-[#ffa116]">
						<Sparkles size={15} fill="#ffa116" />
					</span>
					Favorite
					<LockedStatsIcon className="ml-auto text-[#a4a4a4]" />
				</button>
			</div>
		</aside>
	);
}

function FeatureCarousel({
	activeIndex,
	onChange,
}: {
	activeIndex: number;
	onChange: (value: number) => void;
}) {
	const maxIndex = Math.max(0, featureCards.length - 3);

	return (
		<section className="relative overflow-hidden">
			<div
				className="flex gap-5 transition-transform duration-300 ease-out"
				style={{ transform: `translateX(-${activeIndex * 318}px)` }}
			>
				{featureCards.map((card) => (
					<button
						type="button"
						className="group relative h-[142px] min-w-[300px] overflow-hidden rounded-lg p-5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5"
						key={card.id}
						style={{ background: card.gradient }}
					>
						<div className="absolute inset-0 opacity-70">
							<div className="absolute right-6 bottom-[-56px] h-[145px] w-[145px] rounded-full border border-white/20" />
							<div className="absolute right-9 bottom-8 h-7 w-7 rounded-full bg-white/25 blur-[1px]" />
							<div className="absolute top-0 right-0 h-full w-12 bg-white/5" />
						</div>
						{card.id === "mobile" ? (
							<div className="absolute right-7 bottom-[-25px] h-[72px] w-[170px] -rotate-[16deg] rounded-[18px] border border-white/15 bg-black/45" />
						) : null}
						<div className="relative z-10 max-w-[245px]">
							{card.id === "mobile" ? (
								<div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-[9px] bg-[#2d2d2d] shadow-lg">
									<LeetCodeLogo />
								</div>
							) : null}
							<h2
								className={`font-bold leading-[1.03] tracking-[-0.01em] ${
									card.id === "mobile"
										? "text-center text-[21px]"
										: "text-[22px]"
								}`}
							>
								{card.title}
							</h2>
							{card.subtitle ? (
								<p
									className="mt-2 text-[14px] leading-tight"
									style={{ color: card.accent }}
								>
									{card.subtitle}
								</p>
							) : null}
						</div>
					</button>
				))}
			</div>
			<div className="absolute top-1/2 right-2 flex -translate-y-1/2 gap-2">
				<button
					type="button"
					aria-label="Previous feature cards"
					className="grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
					onClick={() => onChange(Math.max(0, activeIndex - 1))}
				>
					<ChevronLeft size={18} />
				</button>
				<button
					type="button"
					aria-label="Next feature cards"
					className="grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
					onClick={() => onChange(Math.min(maxIndex, activeIndex + 1))}
				>
					<ChevronRight size={18} />
				</button>
			</div>
		</section>
	);
}

function TopicControls({
	activeCategory,
	activePill,
	expandedCategories,
	onCategoryChange,
	onExpandedChange,
	onPillChange,
	onPillStartChange,
	pillStart,
}: {
	activeCategory: string;
	activePill: string;
	expandedCategories: boolean;
	onCategoryChange: (value: string) => void;
	onExpandedChange: (value: boolean) => void;
	onPillChange: (value: string) => void;
	onPillStartChange: (value: number) => void;
	pillStart: number;
}) {
	const visibleCategories = expandedCategories
		? topicCategories
		: topicCategories.slice(0, 6);
	const visiblePills = topicPills.slice(pillStart, pillStart + 5);

	return (
		<section className="mt-9">
			<div
				className={`flex min-w-0 items-center gap-6 text-[16px] font-semibold ${
					expandedCategories ? "flex-wrap gap-y-3" : "overflow-hidden"
				}`}
			>
				{visibleCategories.map((category) => (
					<button
						type="button"
						className={`flex shrink-0 items-center gap-2 whitespace-nowrap transition ${
							activeCategory === category.label
								? "text-white"
								: "text-[#d6d6d6] hover:text-white"
						}`}
						key={category.label}
						onClick={() => onCategoryChange(category.label)}
					>
						<span>{category.label}</span>
						<span className="rounded-full bg-[#333333] px-2 py-0.5 text-[14px] text-[#aaa]">
							{category.count}
						</span>
					</button>
				))}
				<button
					type="button"
					className="ml-auto flex shrink-0 items-center gap-1.5 text-[15px] font-semibold text-[#a9a9a9] hover:text-white"
					onClick={() => onExpandedChange(!expandedCategories)}
				>
					<span>{expandedCategories ? "Collapse" : "Expand"}</span>
					<TripleChevronDown expanded={expandedCategories} />
				</button>
			</div>
			<div className="mt-8 flex items-center gap-4 overflow-hidden border-[#303030] border-b pb-5">
				<button
					type="button"
					aria-label="Previous topic group"
					className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[#303030] text-[#bfbfbf] transition hover:text-white disabled:opacity-30"
					disabled={pillStart === 0}
					onClick={() => onPillStartChange(Math.max(0, pillStart - 1))}
				>
					{"<<"}
				</button>
				{visiblePills.map((pill) => {
					const Icon = pill.icon;
					const active = activePill === pill.label;
					return (
						<button
							type="button"
							className={`flex h-[42px] shrink-0 items-center gap-2.5 rounded-full px-5 text-[17px] font-semibold transition ${
								active
									? "bg-[#f5f5f5] text-[#232323]"
									: "bg-[#303030] text-[#bdbdbd] hover:bg-[#3a3a3a]"
							}`}
							key={pill.label}
							onClick={() => onPillChange(pill.label)}
						>
							<Icon
								size={19}
								style={{ color: active ? "#262626" : pill.color }}
							/>
							<span>{pill.label}</span>
						</button>
					);
				})}
				<button
					type="button"
					aria-label="Next topic group"
					className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[#303030] text-[#bfbfbf] transition hover:text-white disabled:opacity-30"
					disabled={pillStart >= topicPills.length - 5}
					onClick={() =>
						onPillStartChange(Math.min(topicPills.length - 5, pillStart + 1))
					}
				>
					{">>"}
				</button>
			</div>
		</section>
	);
}

function TripleChevronDown({ expanded }: { expanded: boolean }) {
	return (
		<span
			className={`flex items-center transition-transform ${
				expanded ? "rotate-180" : ""
			}`}
		>
			<ChevronDown className="-mr-2" size={14} />
			<ChevronDown className="-mr-2" size={14} />
			<ChevronDown size={14} />
		</span>
	);
}

function ProblemTable({
	difficultyFilter,
	filterOpen,
	onDifficultyFilterChange,
	onFilterOpenChange,
	onProblemSelect,
	onQueryChange,
	onSortChange,
	onStatusFilterChange,
	problems,
	query,
	selectedProblem,
	sortMode,
	statusFilter,
}: {
	difficultyFilter: Difficulty | "All";
	filterOpen: boolean;
	onDifficultyFilterChange: (value: Difficulty | "All") => void;
	onFilterOpenChange: (value: boolean) => void;
	onProblemSelect: (value: number) => void;
	onQueryChange: (value: string) => void;
	onSortChange: () => void;
	onStatusFilterChange: (value: ProblemStatus | "All") => void;
	problems: Problem[];
	query: string;
	selectedProblem: number;
	sortMode: SortMode;
	statusFilter: ProblemStatus | "All";
}) {
	return (
		<section className="relative mt-5">
			<div className="flex items-center gap-3">
				<label className="flex h-9 w-[275px] items-center gap-2.5 rounded-full bg-[#303030] px-4 text-[#a7a7a7]">
					<Search size={18} />
					<input
						className="w-full bg-transparent text-[17px] font-medium outline-none placeholder:text-[#a7a7a7]"
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Search questions"
						value={query}
					/>
				</label>
				<button
					type="button"
					aria-label="Cycle problem sort"
					className="grid h-9 w-9 place-items-center rounded-full bg-[#303030] text-[#a7a7a7] transition hover:text-white"
					onClick={onSortChange}
					title={`Sort: ${sortMode}`}
				>
					<ArrowDownUp size={18} />
				</button>
				<button
					type="button"
					aria-label="Open problem filters"
					className="relative grid h-9 w-9 place-items-center rounded-full bg-[#303030] text-[#a7a7a7] transition hover:text-white"
					onClick={() => onFilterOpenChange(!filterOpen)}
				>
					<SlidersHorizontal size={18} />
					{difficultyFilter !== "All" || statusFilter !== "All" ? (
						<span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#f15454]" />
					) : null}
				</button>
				<div className="ml-auto flex items-center gap-7 text-[#bebebe]">
					<div className="flex items-center gap-2 text-[17px] font-medium">
						<span className="h-[22px] w-[22px] rounded-full border-[3px] border-[#4d4d4d] border-t-[#5aa46f]" />
						<span>83/3944 Solved</span>
					</div>
					<button type="button" className="text-[#bdbdbd] hover:text-white">
						<Shuffle size={19} />
					</button>
				</div>
			</div>
			{filterOpen ? (
				<div className="absolute top-11 left-[322px] z-20 w-[214px] rounded-lg border border-[#3a3a3a] bg-[#242424] p-3 shadow-xl">
					<div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-[#bdbdbd]">
						<span>Filters</span>
						<button type="button" onClick={() => onFilterOpenChange(false)}>
							<X size={15} />
						</button>
					</div>
					<div className="mb-3 grid grid-cols-4 gap-1.5">
						{(["All", "Easy", "Med.", "Hard"] as const).map((value) => (
							<button
								type="button"
								className={`rounded-md px-2 py-1 text-[12px] font-semibold ${
									difficultyFilter === value
										? "bg-[#f5f5f5] text-[#242424]"
										: "bg-[#333] text-[#bdbdbd]"
								}`}
								key={value}
								onClick={() => onDifficultyFilterChange(value)}
							>
								{value}
							</button>
						))}
					</div>
					<div className="grid grid-cols-4 gap-1.5">
						{(["All", "daily", "solved", "todo"] as const).map((value) => (
							<button
								type="button"
								className={`rounded-md px-2 py-1 text-[12px] font-semibold capitalize ${
									statusFilter === value
										? "bg-[#f5f5f5] text-[#242424]"
										: "bg-[#333] text-[#bdbdbd]"
								}`}
								key={value}
								onClick={() => onStatusFilterChange(value)}
							>
								{value}
							</button>
						))}
					</div>
				</div>
			) : null}
			<div className="mt-4 space-y-2.5">
				{problems.length ? (
					problems.map((problem, index) => (
						<button
							type="button"
							className={`grid min-h-[48px] w-full grid-cols-[34px_minmax(220px,1fr)_88px_72px_72px] items-center rounded-lg px-4 text-left transition ${
								selectedProblem === problem.id || index % 2 === 0
									? "bg-[#282828]"
									: "bg-transparent"
							} hover:bg-[#303030]`}
							key={problem.id}
							onClick={() => onProblemSelect(problem.id)}
						>
							<ProblemStatusIcon status={problem.status} />
							<div className="min-w-0 truncate text-[16px] font-bold text-[#f0f0f0]">
								<span className="mr-2">{problem.id}.</span>
								<span>{problem.title}</span>
							</div>
							<div className="text-[16px] font-medium text-[#aaa]">
								{problem.acceptance.toFixed(1)}%
							</div>
							<div
								className={`text-[16px] font-medium ${difficultyColor(problem.difficulty)}`}
							>
								{problem.difficulty}
							</div>
							<LockedStatsIcon className="justify-self-end text-[#a0a0a0]" />
						</button>
					))
				) : (
					<div className="rounded-lg bg-[#282828] px-4 py-8 text-center text-[15px] font-medium text-[#aaa]">
						No problems match the current filters.
					</div>
				)}
			</div>
		</section>
	);
}

function ProblemStatusIcon({ status }: { status: ProblemStatus }) {
	if (status === "daily") {
		return <CalendarDays className="text-[#2f81f7]" size={19} />;
	}

	if (status === "solved") {
		return <Check className="text-[#35b447]" size={20} strokeWidth={2.4} />;
	}

	return <span />;
}

function difficultyColor(difficulty: Difficulty) {
	if (difficulty === "Easy") {
		return "text-[#3cc8c8]";
	}
	if (difficulty === "Med.") {
		return "text-[#ffc01e]";
	}
	return "text-[#ef4743]";
}

function LockedStatsIcon({ className = "" }: { className?: string }) {
	return (
		<div className={`relative flex gap-0.5 px-1 ${className}`}>
			{lockBars.map((bar) => (
				<div className="h-2 w-0.5 rounded bg-current opacity-20" key={bar} />
			))}
			<div className="-top-[3px] absolute left-1/2 p-[1px] text-[12px] leading-[normal] text-[#8b8b8b] before:block before:h-3 before:w-3 -translate-x-1/2">
				<svg
					aria-hidden="true"
					className="absolute top-1/2 left-1/2 h-[1em] -translate-x-1/2 -translate-y-1/2 align-[-0.125em]"
					focusable="false"
					role="img"
					viewBox="0 0 448 512"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M224 64c44.2 0 80 35.8 80 80v48H144V144c0-44.2 35.8-80 80-80zM80 144v48H64c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V256c0-35.3-28.7-64-64-64H368V144C368 64.5 303.5 0 224 0S80 64.5 80 144zM256 320v64c0 17.7-14.3 32-32 32s-32-14.3-32-32V320c0-17.7 14.3-32 32-32s32 14.3 32 32z"
						fill="currentColor"
					/>
				</svg>
			</div>
		</div>
	);
}

function CalendarPanel({
	activeWeek,
	badge,
	month,
	onDaySelect,
	onMonthChange,
	onWeekChange,
	selectedDay,
}: {
	activeWeek: string;
	badge: BadgeVariant;
	month: CalendarMonth;
	onDaySelect: (value: string) => void;
	onMonthChange: (direction: -1 | 1) => void;
	onWeekChange: (value: string) => void;
	selectedDay: string;
}) {
	return (
		<section className="relative rounded-lg bg-[#282828] px-5 pt-6 pb-4 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
			<StreakBadge badge={badge} />
			<div className="relative flex min-h-8 items-center pr-[92px] text-[16px] font-medium text-[#bdbdbd]">
				<span className="text-[18px] text-[#d7d7d7]">{month.name}</span>
				<span className="ml-2 text-[13px] text-[#858585]">{month.timer}</span>
				<div className="absolute top-0 right-0 flex gap-6 text-[#8e8e8e]">
					<button
						type="button"
						aria-label="Previous calendar month"
						className="hover:text-white"
						onClick={() => onMonthChange(-1)}
					>
						<ChevronLeft size={18} />
					</button>
					<button
						type="button"
						aria-label="Next calendar month"
						className="hover:text-white"
						onClick={() => onMonthChange(1)}
					>
						<ChevronRight size={18} />
					</button>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-7 gap-y-3 text-center text-[14px] font-medium text-[#7f7f7f]">
				{weekDays.map((day) => (
					<span key={day.id}>{day.label}</span>
				))}
				{month.days.map((day) => (
					<button
						type="button"
						className={`relative mx-auto grid h-[25px] w-[25px] place-items-center rounded-full text-[16px] transition ${
							selectedDay === day.label && day.label
								? "bg-[#58bd65] font-bold text-white"
								: day.label === "16"
									? "text-[#2f81f7] ring-2 ring-[#2f81f7]"
									: "text-[#b1b1b1] hover:bg-[#363636]"
						}`}
						disabled={!day.label}
						key={day.key}
						onClick={() => day.label && onDaySelect(day.label)}
					>
						{day.label === "16" ? (
							<Check size={15} strokeWidth={2.6} />
						) : (
							day.label
						)}
						{day.solved && selectedDay !== day.label ? (
							<span className="-bottom-[5px] absolute h-1 w-1 rounded-full bg-[#e95a54]" />
						) : null}
					</button>
				))}
			</div>
			<div className="relative mt-5 overflow-hidden rounded-lg bg-[#4a3b27] px-4 pt-4 pb-5">
				<div className="absolute right-0 bottom-0 h-full w-[70%] bg-[#5b4528] [clip-path:polygon(28%_0,100%_0,100%_100%,0_100%)]" />
				<div className="relative flex items-center justify-between text-[15px] font-bold">
					<span className="text-[#ffa116]">Weekly Premium ◎</span>
					<span className="font-medium text-[#9f958b]">2 days left</span>
				</div>
				<div className="relative mt-6 grid grid-cols-5 text-center text-[15px] font-bold text-[#ffa116]">
					{["W1", "W2", "W3", "W4", "W5"].map((week) => (
						<button
							type="button"
							className={
								activeWeek === week
									? "mx-auto rounded-full bg-[#ffa116] px-2 py-1 text-white"
									: week === "W5"
										? "text-[#8d8176]"
										: ""
							}
							key={week}
							onClick={() => onWeekChange(week)}
						>
							{week}
						</button>
					))}
				</div>
			</div>
			<div className="mt-5 flex items-center text-[15px]">
				<ShieldCheck className="mr-2 text-[#78d899]" size={22} fill="#78d899" />
				<span className="mr-3 text-[#d0d0d0]">0</span>
				<button type="button" className="text-[#58c76c] hover:text-[#72dd84]">
					Redeem
				</button>
				<button
					type="button"
					className="ml-auto text-[#bcbcbc] hover:text-white"
				>
					Rules
				</button>
			</div>
		</section>
	);
}

function StreakBadge({ badge }: { badge: BadgeVariant }) {
	return (
		<div
			className="-top-[45px] absolute right-[54px] z-10 h-[74px] w-[66px]"
			style={{ color: badge.color }}
			title={`${badge.name} badge`}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 transition duration-500 ease-in-out"
				fill="none"
				focusable="false"
				viewBox="0 0 66 74"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M30 2.73205C31.8564 1.66025 34.1436 1.66025 36 2.73205L61.1769 17.2679C63.0333 18.3397 64.1769 20.3205 64.1769 22.4641V51.5359C64.1769 53.6795 63.0333 55.6603 61.1769 56.7321L36 71.2679C34.1436 72.3397 31.8564 72.3397 30 71.2679L4.82309 56.7321C2.96668 55.6603 1.82309 53.6795 1.82309 51.5359V22.4641C1.82309 20.3205 2.96668 18.3397 4.82309 17.2679L30 2.73205Z"
					fill={badge.fill}
				/>
				<path
					d="M30 2.73205C31.8564 1.66025 34.1436 1.66025 36 2.73205L61.1769 17.2679C63.0333 18.3397 64.1769 20.3205 64.1769 22.4641V51.5359C64.1769 53.6795 63.0333 55.6603 61.1769 56.7321L36 71.2679C34.1436 72.3397 31.8564 72.3397 30 71.2679L4.82309 56.7321C2.96668 55.6603 1.82309 53.6795 1.82309 51.5359V22.4641C1.82309 20.3205 2.96668 18.3397 4.82309 17.2679L30 2.73205Z"
					fill="none"
					stroke="#707070"
					strokeWidth="3.5"
				/>
				<path
					d="M30 2.73205C31.8564 1.66025 34.1436 1.66025 36 2.73205L61.1769 17.2679C63.0333 18.3397 64.1769 20.3205 64.1769 22.4641V51.5359C64.1769 53.6795 63.0333 55.6603 61.1769 56.7321L36 71.2679C34.1436 72.3397 31.8564 72.3397 30 71.2679L4.82309 56.7321C2.96668 55.6603 1.82309 53.6795 1.82309 51.5359V22.4641C1.82309 20.3205 2.96668 18.3397 4.82309 17.2679L30 2.73205Z"
					fill="none"
					stroke={badge.ring}
					strokeDasharray="5.217741935483871 210.78225806451613"
					strokeDashoffset="212.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeOpacity="0.75"
					strokeWidth="3.5"
				/>
			</svg>
			<div className="absolute inset-0 grid place-items-center text-center">
				<div>
					<div className="text-[31px] font-black leading-none text-[#9a9a9a]">
						5
					</div>
					<div className="text-[9px] font-bold tracking-wide text-[#a68f5c]">
						MAY
					</div>
				</div>
			</div>
		</div>
	);
}

function TrendingCompanies({
	companies,
	onPageChange,
	onQueryChange,
	query,
}: {
	companies: Company[];
	onPageChange: (direction: -1 | 1) => void;
	onQueryChange: (value: string) => void;
	query: string;
}) {
	return (
		<section className="rounded-lg bg-[#282828] px-5 pt-4 pb-5">
			<div className="mb-3 flex items-center">
				<h2 className="text-[17px] font-bold text-[#cfcfcf]">
					Trending Companies
				</h2>
				<div className="ml-auto flex gap-2">
					<button
						type="button"
						aria-label="Previous company page"
						className="grid h-8 w-8 place-items-center rounded-md bg-[#404040] text-[#b7b7b7] transition hover:text-white"
						onClick={() => onPageChange(-1)}
					>
						<ChevronLeft size={19} strokeWidth={3} />
					</button>
					<button
						type="button"
						aria-label="Next company page"
						className="grid h-8 w-8 place-items-center rounded-md bg-[#404040] text-[#b7b7b7] transition hover:text-white"
						onClick={() => onPageChange(1)}
					>
						<ChevronRight size={19} strokeWidth={3} />
					</button>
				</div>
			</div>
			<label className="mb-4 flex h-9 items-center gap-2.5 rounded-md bg-[#404040] px-3 text-[#8f8f8f]">
				<Search size={17} />
				<input
					className="w-full bg-transparent text-[15px] font-semibold outline-none placeholder:text-[#8f8f8f]"
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Search for a company..."
					value={query}
				/>
			</label>
			<div className="grid grid-cols-2 gap-x-4 gap-y-3">
				{companies.length ? (
					companies.map((company) => (
						<div
							className="flex h-[28px] items-center justify-between rounded-full bg-[#4a4a4a] pl-3 text-[14px] font-bold text-[#cfcfcf]"
							key={company.name}
						>
							<span className="truncate">{company.name}</span>
							<span className="mr-1 rounded-full bg-[#ffa116] px-2 py-0.5 font-bold text-[#202020]">
								{company.count}
							</span>
						</div>
					))
				) : (
					<div className="col-span-2 rounded-md bg-[#333] px-3 py-4 text-center text-[14px] text-[#aaa]">
						No companies found.
					</div>
				)}
			</div>
		</section>
	);
}
