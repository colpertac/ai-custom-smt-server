local entityState = null;
local counter = null;
local countActive = false;

function define(script)
{
    script.Name = "silentCounter";
    script.Type = "AI";
    script.Instantiated = true;
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    entityState = aiState;
    aiState.SetActionOverridesEntry("prepareSkill", "");
    aiState.SetActionOverridesEntry("combatSkillComplete", "");
    return 0;
}


function combatSkillComplete(source, manager, activated, target, hit)
{
    local statusActive = entityState.GetActionOverridesByKey("statusActive");
    if(statusActive != "")
    {
        if(!countActive)
        {
            foreach(status in source.GetStatusEffects())
            {
                if(status.GetEffect() == statusActive.tointeger())
                {
                    countActive = true;
                    break;
                }
            }
        }
    }
    else
    {
        countActive = true;
    }
    return 1;
}
function prepareSkill(eState, manager, target)
{
    if(countActive)
    {
        local aiState = eState.GetAIState();
        if(counter == null)
        {
            counter = aiState.GetActionOverridesByKey("initialCounter").tointeger();
        }
        else
        {
            counter -= 1;
        }

        if(counter <= 0)
        {
            countActive = false;
            counter = null;

            local zone = eState.GetZone();
            local eventID = aiState.GetActionOverridesByKey("counterEvent");
            if(eventID != "" && zone != null)
            {
                manager.StartEvent(eState, eventID);
            }
        }
        
        if(aiState.GetActionOverridesByKey("passiveWhileActive") == "true")
        {
            return 0;
        }
    }
    return 1;
}