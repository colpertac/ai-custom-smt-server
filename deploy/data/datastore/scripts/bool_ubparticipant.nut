function define(script)
{
    script.Name = "bool_ubParticipant";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character is a participant in the current zone
function check(source, cState, dState, zone, value1, value2, params)
{
    local ubMatch = zone != null ? zone.GetUBMatch() : null;
    if(cState != null && ubMatch != null &&
        ubMatch.MemberIDsContains(cState.GetWorldCID()))
    {
        return 0;
    }

    return -1;
}