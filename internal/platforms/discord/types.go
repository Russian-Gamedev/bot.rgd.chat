package discord

import "strconv"

type ID uint64

func ParseID(s string) (ID, error) {
	id, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, err
	}
	return ID(id), nil
}
