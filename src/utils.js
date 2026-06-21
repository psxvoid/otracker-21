import {
	format,
	parseISO,
	isToday,
} from 'date-fns';

const getDateAsString = function(date) {
	const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'yyyy-MM-dd')
}

const getDayOfTheWeek = function(date) {
	return format(parseISO(date),'EEEE').toLowerCase();
}

const pluralize = function(count, singular, plural) {
	if (count === 1) return singular
	return plural || singular + 's'
}

const renderPrettyDate = function (dateString) {
		// Parse the input date string into a Date object
		const date = parseISO(dateString)

		let prettyDate = window.moment(date).format('ll')

		let prefix = isToday(date) ? 'Today' : window.moment(date).format('ddd')

		prettyDate = `${prefix}, ${prettyDate}`;

		return prettyDate
	}

const isValidCSSColor = function (color) {
	if (!color) return false
	const tempEl = document.createElement('div')
	tempEl.style.color = color
	return tempEl.style.color !== ''
}

export {
	getDateAsString,
	getDayOfTheWeek,
	renderPrettyDate,
	pluralize,
	isValidCSSColor
};
